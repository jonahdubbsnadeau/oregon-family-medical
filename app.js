var express = require('express');
var handlebars = require('express-handlebars').create({ defaultLayout: 'layout' });
var bodyParser = require('body-parser');
var mysql = require('mysql');

var app = express();
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');
app.set('port', 8054);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

var pool = mysql.createPool({
    connectionLimit: 10,
    host:            'classmysql.engr.oregonstate.edu',
    user:            'cs340_dubbsnaj',
    password:        '8054',
    database:        'cs340_dubbsnaj',
});

var days_of_the_week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
var months = [null, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function execute(list, args, index, done) {
    list[index](args[index]);
    index++;

    if (index < list.length) {
        execute(list, args, index, done);
    } else {
        done();
    }
}

function schedule(args) {
    pool.query('UPDATE APPOINTMENTS SET patient_id = ?, chief_complaint = ? WHERE appointment_id = ?', [args.patient, args.reason, args.appt], function(error, results, fields) {
        if (error) {
            res.write(JSON.stringify(error));
            res.end();
        }
    });
}

function unschedule(args) {
    pool.query('UPDATE APPOINTMENTS SET patient_id = NULL, chief_complaint = NULL WHERE appointment_id = ?', [args.appt], function(error, results, fields) {
        if (error) {
            res.write(JSON.stringify(error));
            res.end();
        }
    });
}

app.get('/', function(req, res) {
    res.render('home', {});
});

app.route('/schedule')

    .get(function(req, res) {

        if (req.body) {

            // AJAX request for available times on a given date
            if (req.body.year) {
                pool.query('SELECT appointment_id AS id, time FROM APPOINTMENTS WHERE patient_id IS NULL AND doctor_id = ? AND location_id = ? AND year = ? AND month = ? AND day = ?', [req.body.doctor, req.body.location, req.body.year, req.body.month, req.body.day], function(error, results, fields) {
                    if (error) {
                        res.write(JSON.stringify(error));
                        res.end();
                    }
                    res.send(JSON.stringify(results));
                });
            }
            
            // AJAX request for dates of available appointments
            else if (req.body.patient) {
                // Get primary doctor and location
                var query = 'SELECT DOCTORS.doctor_id AS did, DOCTORS.title AS dtitle, DOCTORS.first_name AS dfname, DOCTORS.last_name AS dlname, LOCATIONS.location_id AS lid, LOCATIONS.label AS location FROM PATIENTS ';
                query += 'JOIN DOCTORS ON PATIENTS.primary_doctor = DOCTORS.doctor_id AND PATIENTS.patient_id = ? ';
                query += 'JOIN LOCATIONS ON PATIENTS.primary_location = LOCATIONS.location_id AND PATIENTS.patient_id = ?';

                pool.query(query, [req.body.patient, req.body.patient], function(error, results, fields) {
                    if (error) {
                        res.write(JSON.stringify(error));
                        res.end();
                    }

                    var doctor = results[0].did;
                    var location = results[0].lid;

                    // Get available appointments
                    pool.query('SELECT year, month, day FROM APPOINTMENTS WHERE patient_id IS NULL AND doctor_id = ? AND location_id = ? GROUP BY month, day', [doctor, location], function(error, results, fields) {
                        if (error) {
                            res.write(JSON.stringify(error));
                            res.end();
                        }
                        res.send(JSON.stringify(results));
                    });
                });
            }
        }
        
        else {

            // Rescheduling appointment; patient is pre-selected and cannot be changed
            if (req.query.appt) {
                pool.query('SELECT first_name, last_name FROM PATIENTS WHERE patient_id = ?', [req.query.patient], function(error, results, fields) {
                    if (error) {
                        res.write(JSON.stringify(error));
                        res.end();
                    }

                    res.render('schedule', {
                        current_patient: req.query.patient,
                        current_patient_name: results[0].first_name + ' ' + results[0].last_name,
                        oldAppt: req.query.appt
                    });
                });
            }
            
            else {
                pool.query('SELECT patient_id, first_name, last_name FROM PATIENTS WHERE primary_doctor IS NOT NULL AND primary_location IS NOT NULL', function(error, results, fields) {
                    if (error) {
                        res.write(JSON.stringify(error));
                        res.end();
                    }
                    
                    if (req.query.patient) {
                        // Patient is pre-selected
                        res.render('schedule', { current_patient: req.query.patient, patient_option: results });
                    } else {
                        res.render('schedule', { patient_option: results });
                    }
                });
            }
        }
    })

    .post(function(req, res) {
        if (req.body.reschedule) {
            execute(
                [unschedule, schedule],
                [{ appt: req.body.oldAppt }, { patient: req.body.patient, reason: req.body.reason, appt: req.body.newAppt }],
                0,
                function() { res.redirect('/schedule/success?appt=' + req.body.newAppt) }
            );
        } else {
            execute([schedule], [req.body], 0, function() { res.redirect('/schedule/success?appt=' + req.body.appt) });
        }
    })
;

app.get('/schedule/success', function(req, res) {
    var query = 'SELECT PATIENTS.patient_id AS pid, PATIENTS.first_name AS pfname, PATIENTS.last_name AS plname, year, month, day, time, day_of_week, title AS dtitle, DOCTORS.first_name AS dfname, DOCTORS.last_name AS dlname, label AS location FROM APPOINTMENTS';
    query += 'JOIN PATIENTS ON APPOINTMENTS.patient_id = PATIENTS.patient_id';
    query += 'JOIN DOCTORS ON APPOINTMENTS.doctor_id = DOCTORS.doctor_id';
    query += 'JOIN LOCATIONS ON APPOINTMENTS.location_id = LOCATIONS.location_id';
    query += 'WHERE appointment_id = ?';

    pool.query(query, [req.query.appt], function(error, results, fields) {
        if (error) {
            res.write(JSON.stringify(error));
            res.end();
        }

        var appt = results[0];
        var context = {
            day_of_week: days_of_the_week[appt.day_of_week],
            month: months[appt.month],
            day: appt.day,
            year: appt.year,
            time: appt.time,
            patient: appt.pfname + ' ' + appt.plname,
            doctor: appt.dtitle + ' ' + appt.dfname + ' ' + appt.dlname,
            location: appt.location,
            lookup: '/r/patient?id=' + pid
        };

        res.render('confirmation', context);
    });
});

app.use(function(req, res) {
    res.status(404);
    res.render('error', { code: '404' });
});

app.use(function(err, req, res, next) {
    res.status(500);
    res.render('error', { code: '500' });
});

app.listen(app.get('port'), function() {
    console.log('Express started on ' + app.get('port') + '; press Ctrl-C to terminate.');
});
