var express = require('express');
var handlebars = require('express-handlebars').create({ defaultLayout: 'layout' });
var bodyParser = require('body-parser');
var mysql = require('./dbcon.js');

var app = express();
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');
app.set('port', 8054);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

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
    mysql.pool.query('UPDATE APPOINTMENTS SET patient_id = ?, chief_complaint = ? WHERE appointment_id = ?', [args.patient, args.reason, args.appt], function(error, results, fields) {
        if (error) {
            res.write(JSON.stringify(error));
            res.end();
        }
    });
}

function unschedule(args) {
    mysql.pool.query('UPDATE APPOINTMENTS SET patient_id = NULL, chief_complaint = NULL WHERE appointment_id = ?', [args.appt], function(error, results, fields) {
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
        if (req.query.ajax) {
            // AJAX request for available times on a given date
            if (req.query.year) {
                mysql.pool.query('SELECT appointment_id AS id, time FROM APPOINTMENTS WHERE patient_id IS NULL AND doctor_id = ? AND location_id = ? AND year = ? AND month = ? AND day = ?', [req.query.doctor, req.query.location, req.query.year, req.query.month, req.query.day], function(error, results, fields) {
                    if (error) {
                        res.write(JSON.stringify(error));
                        res.end();
                    }
                    res.send(JSON.stringify(results));
                });
            }
            
            // AJAX request for dates of available appointments
            else if (req.query.patient) {
                // Get primary doctor and location
                var query = 'SELECT DOCTORS.doctor_id AS did, CONCAT(DOCTORS.title, " ", DOCTORS.first_name, " ", DOCTORS.last_name) AS doctor, LOCATIONS.location_id AS lid, LOCATIONS.label AS location FROM PATIENTS ';
                query += 'JOIN DOCTORS ON PATIENTS.primary_doctor = DOCTORS.doctor_id AND PATIENTS.patient_id = ? ';
                query += 'JOIN LOCATIONS ON PATIENTS.primary_location = LOCATIONS.location_id AND PATIENTS.patient_id = ?';

                mysql.pool.query(query, [req.query.patient, req.query.patient], function(error, results, fields) {
                    if (error) {
                        res.write(JSON.stringify(error));
                        res.end();
                    }

                    var result = {
                        did: results[0].did,
                        doctor: results[0].doctor,
                        lid: results[0].lid,
                        location: results[0].location
                    };

                    // Get available appointments
                    mysql.pool.query('SELECT CONCAT(year, "-", month, "-", day) AS date FROM APPOINTMENTS WHERE patient_id IS NULL AND doctor_id = ? AND location_id = ? GROUP BY month, day', [result.did, result.lid], function(error, results, fields) {
                        if (error) {
                            res.write(JSON.stringify(error));
                            res.end();
                        }

                        result.dates = results;
                        res.send(JSON.stringify(result));
                    });
                });
            }
        }

        // Rescheduling appointment; patient is pre-selected and cannot be changed
        else if (req.query.appt) {
            mysql.pool.query('SELECT first_name, last_name FROM PATIENTS WHERE patient_id = ?', [req.query.patient], function(error, results, fields) {
                if (error) {
                    res.write(JSON.stringify(error));
                    res.end();
                }

                console.log(results);

                res.render('schedule', {
                    current_patient: req.query.patient,
                    current_patient_name: results[0].first_name + ' ' + results[0].last_name,
                    oldAppt: req.query.appt
                });
            });
        }
    
        else {
            mysql.pool.query('SELECT patient_id, first_name, last_name FROM PATIENTS WHERE primary_doctor IS NOT NULL AND primary_location IS NOT NULL', function(error, results, fields) {
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
    var query = 'SELECT PATIENTS.patient_id AS pid, PATIENTS.first_name AS pfname, PATIENTS.last_name AS plname, year, month, day, time, day_of_week, title AS dtitle, DOCTORS.first_name AS dfname, DOCTORS.last_name AS dlname, label AS location FROM APPOINTMENTS ';
    query += 'JOIN PATIENTS ON APPOINTMENTS.patient_id = PATIENTS.patient_id ';
    query += 'JOIN DOCTORS ON APPOINTMENTS.doctor_id = DOCTORS.doctor_id ';
    query += 'JOIN LOCATIONS ON APPOINTMENTS.location_id = LOCATIONS.location_id ';
    query += 'WHERE appointment_id = ?';

    mysql.pool.query(query, [req.query.appt], function(error, results, fields) {
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
            time: convert_time(appt.time),
            patient: appt.pfname + ' ' + appt.plname,
            doctor: appt.dtitle + ' ' + appt.dfname + ' ' + appt.dlname,
            location: appt.location,
            pid: appt.pid
        };

        res.render('confirmation', context);
    });
});

app.route('/cu/patient')

    .get(function(req, res) {
        var context = {
            form_action: '/cu/patient',
            form_method: 'POST',
            item: [
                { id: 'fname', name: 'fname', type: 'text', required: true, label: 'First Name' },
                { id: 'lname', name: 'lname', type: 'text', required: true, label: 'Last Name' },
                { id: 'bdate', name: 'bdate', type: 'date', required: true, label: 'Birth Date' },
                { id: 'eaddress', name: 'eaddress', type: 'text', required: true, label: 'Email Address' },
                { id: 'phone', name: 'phone', type: 'tel', required: true, label: 'Phone' }
            ]
        };

        mysql.pool.query('SELECT doctor_id AS option_value, CONCAT(title, " ", first_name, " ", last_name) AS option_text FROM DOCTORS', function(error, results, fields) {
            if (error) {
                res.write(JSON.stringify(error));
                res.end();
            }
            
            context.item.push( { id: 'pdoctor', name: 'pdoctor', select: true, label: 'Primary Doctor', option: results } );

            mysql.pool.query('SELECT location_id AS option_value, label AS option_text FROM LOCATIONS', function(error, results, fields) {
                if (error) {
                    res.write(JSON.stringify(error));
                    res.end();
                }

                context.item.push( { id: 'plocation', name: 'plocation', select: true, label: 'Primary Location', option: results } );

                if (req.query.id) {
                    mysql.pool.query('SELECT patient_id, first_name, last_name, birthdate, email, phone FROM PATIENTS WHERE patient_id = ?', [req.query.id], function(error, results, fields) {
                        if (error) {
                            res.write(JSON.stringify(error));
                            res.end();
                        }

                        context.form_header = 'Edit a Patient';
                        context.existing_id = results[0].patient_id;
                        context.item[0].preset = results[0].first_name;
                        context.item[1].preset = results[0].last_name;
                        context.item[2].preset = to_ISO(results[0].birthdate);
                        context.item[3].preset = results[0].email;
                        context.item[4].preset = results[0].phone;

                        res.render('add-edit', context);
                    });
                } else {
                    context.form_header = 'Add a Patient'
                    res.render('add-edit', context);
                }
            });
        });
    })

    .post(function(req, res) {        
        if (req.body.existing) {
            // Update logic goes here
        } else {
            var sql = "INSERT INTO PATIENTS (first_name, last_name, birthdate, email, phone, primary_doctor, primary_location) VALUES (?,?,?,?,?,?,?)";
            var inserts = [req.body.fname, req.body.lname, req.body.bdate, req.body.eaddress, req.body.phone, req.body.pdoctor, req.body.plocation];

            mysql.pool.query(sql, inserts, function(error, results, fields) {
                if (error) {
                    console.log(JSON.stringify(error));
                    res.write(JSON.stringify(error));
                    res.end();
                } else {
                    res.redirect('/r/patient?c=success');
                }
            });
        }
    })
;

app.route('/cu/doctor')

    .get(function(req, res) {
        var context = {
            form_action: '/cu/doctor',
            form_method: 'POST',
            item: [
                { id: 'title', name: 'title', type: 'text', required: true, label: 'Title' },
                { id: 'fname', name: 'fname', type: 'text', required: true, label: 'First Name' },
                { id: 'lname', name: 'lname', type: 'text', required: true, label: 'Last Name' },
                { id: 'degree', name: 'degree', type: 'text', required: true, label: 'Degree' }
            ]
        };

        mysql.pool.query('SELECT location_id, label FROM LOCATIONS', function(error, results, fields) {
            if (error) {
                res.write(JSON.stringify(error));
                res.end();
            }

            context.checkbox = [];
            context.checklist_header = 'Location(s):';
            
            for (var i = 0; i < results.length; i++) {
                context.checkbox.push({ 
                    id: results[i].location_id,
                    name: results[i].location_id,
                    label: results[i].label,
                });
            }

            if (req.query.id) {
                mysql.pool.query('SELECT doctor_id, title, first_name, last_name, degree FROM DOCTORS WHERE doctor_id = ?', [req.query.id], function(error, results, fields) {
                    if (error) {
                        res.write(JSON.stringify(error));
                        res.end();
                    }

                    context.form_header = 'Edit a Doctor';
                    context.existing_id = results[0].doctor_id;
                    context.item[0].preset = results[0].title;
                    context.item[1].preset = results[0].first_name;
                    context.item[2].preset = results[0].last_name;
                    context.item[3].preset = results[0].degree;

                    res.render('add-edit', context);
                });
            } else {
                context.form_header = 'Add a Doctor';
                res.render('add-edit', context);
            }
        });
    })

    .post(function(req, res) {
        if (req.body.existing) {
            // Update logic goes here
        } else {
            var sql = "INSERT INTO DOCTORS (title, first_name, last_name, degree) VALUES (?,?,?,?)";
            var inserts = [req.body.title, req.body.fname, req.body.lname, req.body.degree];
            
            mysql.pool.query(sql, inserts, function(error, results, fields) {
                if (error) {
                    console.log(JSON.stringify(error));
                    res.write(JSON.stringify(error));
                    res.end();
                } else {
                    res.redirect('/r/doctor?c=success');
                }
            });
        } 
    })
;

app.route('/cu/location')

    .get(function(req, res) {
        var context = {
            form_action: '/cu/location',
            form_method: 'POST',
            item: [
                { id: 'label', name: 'label', type: 'text', required: true, label: 'Location Name' },
                { id: 'street1', name: 'street1', type: 'text', required: true, label: 'Address (Line 1)' },
                { id: 'street2', name: 'street2', type: 'text', label: 'Address (Line 2)' },
                { id: 'city', name: 'city', type: 'text', required: true, label: 'City' },
                { id: 'state', name: 'state', type: 'text', required: true, label: 'State' },
                { id: 'zip', name: 'zip', type: 'text', required: true, label: 'ZIP' },
                { id: 'phone', name: 'phone', type: 'tel', required: true, label: 'Phone' }
            ]
        };

        mysql.pool.query('SELECT doctor_id, CONCAT(title, " ", first_name, " ", last_name) AS name FROM DOCTORS', function(error, results, fields) {
            if (error) {
                res.write(JSON.stringify(error));
                res.end();
            }

            context.checkbox = [];
            context.checklist_header = 'Doctor(s):';
            
            for (var i = 0; i < results.length; i++) {
                context.checkbox.push({ 
                    id: results[i].doctor_id,
                    name: results[i].doctor_id,
                    label: results[i].name,
                });
            }

            if (req.query.id) {
                mysql.pool.query('SELECT location_id, label, street1, street2, city, state, zip, phone FROM LOCATIONS WHERE location_id = ?', [req.query.id], function(error, results, fields) {
                    if (error) {
                        res.write(JSON.stringify(error));
                        res.end();
                    }

                    context.form_header = 'Edit a Location';
                    context.existing_id = results[0].location_id;
                    context.item[0].preset = results[0].label;
                    context.item[1].preset = results[0].street1;
                    if (results[0].street2) {
                        context.item[2].preset = results[0].street2;
                    }
                    context.item[3].preset = results[0].city;
                    context.item[4].preset = results[0].state;
                    context.item[5].preset = results[0].zip;
                    context.item[6].preset = results[0].phone;

                    res.render('add-edit', context);
                });
            } else {
                context.form_header = 'Add a Location';
                res.render('add-edit', context);
            }
        });
    })

    .post(function(req, res) {
        if (req.body.existing) {
            // Update logic goes here
        } else {
            var sql, inserts;
            
            if (!req.body.street2 || req.body.street2 == '') {
                sql = "INSERT INTO LOCATIONS (label, street1, city, state, zip, phone) VALUES (?,?,?,?,?,?)";
                inserts = [req.body.label, req.body.street1, req.body.city, req.body.state, req.body.zip, req.body.phone];
            } else {
                sql = "INSERT INTO LOCATIONS (label, street1, street2, city, state, zip, phone) VALUES (?,?,?,?,?,?,?)";
                inserts = [req.body.label, req.body.street1, req.body.street2, req.body.city, req.body.state, req.body.zip, req.body.phone];
            }
            
            mysql.pool.query(sql, inserts, function(error, results, fields) {
                if (error) {
                    console.log(JSON.stringify(error));
                    res.write(JSON.stringify(error));
                    res.end();
                } else {
                    res.redirect('/r/location?c=success');
                }
            });
        }
    })
;

app.route('/cu/appointment')

    .get(function(req, res) {
        var context = {
            form_action: '/cu/appointment',
            form_method: 'POST',
            item: [
                { id: 'time', name: 'time', type: 'time', required: true, label: 'Appointment Time' },
                { id: 'date', name: 'date', type: 'date', required: true, label: 'Appointment Date' }
            ]
        };

        mysql.pool.query('SELECT doctor_id AS option_value, CONCAT(title, " ", first_name, " ", last_name) AS option_text FROM DOCTORS', function(error, results, fields) {
            if (error) {
                res.write(JSON.stringify(error));
                res.end();
            }
            
            context.item.push( { id: 'doc', name: 'doc', select: true, label: 'Doctor', option: results } );

            mysql.pool.query('SELECT location_id AS option_value, label AS option_text FROM LOCATIONS', function(error, results, fields) {
                if (error) {
                    res.write(JSON.stringify(error));
                    res.end();
                }

                context.item.push( { id: 'loc', name: 'loc', select: true, label: 'Location', option: results } );

                if (req.query.id) {
                    mysql.pool.query('SELECT appointment_id, time, year, month, day FROM APPOINTMENTS WHERE appointment_id = ?', [req.query.id], function(error, results, fields) {
                        if (error) {
                            res.write(JSON.stringify(error));
                            res.end();
                        }

                        context.form_header = 'Edit an Appointment';
                        context.existing_id = results[0].appointment_id;

                        context.item[0].preset = results[0].time;

                        var date = "" + results[0].year + "-";
                        if (results[0].month < 10) {
                            date += "0";
                        }
                        date += results[0].month + "-";
                        if (results[0].day < 10) {
                            date += "0";
                        }
                        date += results[0].day;

                        context.item[1].preset = date;

                        res.render('add-edit', context);
                    });
                } else {
                    context.form_header = 'Add an Appointment';
                    res.render('add-edit', context);
                }
            });
        });
    })

    .post(function(req, res) {
        if (req.body.existing) {
            // Update logic goes here
        } else {
            var sql = "INSERT INTO APPOINTMENTS (doctor_id, location_id, time, year, month, day, day_of_week) VALUES (?,?,?,?,?,?,?)";
            var inserts = [req.body.doc, req.body.loc, req.body.time, get_year(req.body.date), get_month(req.body.date), get_day(req.body.date), get_day_of_week(req.body.date) ];
            
            mysql.pool.query(sql, inserts, function(error, results, fields) {
                if (error) {
                    console.log(JSON.stringify(error));
                    res.write(JSON.stringify(error));
                    res.end();
                } else {
                    res.redirect('/manage?c=success');
                }
            });
        }
    })
;

app.get('/r/patient', function(req, res) {
    if (req.query.id) {
        var query = 'SELECT PATIENTS.patient_id AS pid, CONCAT(PATIENTS.first_name, " ", PATIENTS.last_name) AS name, birthdate, email, PATIENTS.phone AS phone, ';
        query += 'CONCAT(title, " ", DOCTORS.first_name, " ", DOCTORS.last_name) AS doc, label AS loc, ';
        query += 'appointment_id AS aid, day_of_week, month, CONCAT(" ", day, ", ", year) AS header, time, chief_complaint AS reason FROM PATIENTS ';
        query += 'JOIN DOCTORS ON PATIENTS.primary_doctor = DOCTORS.doctor_id ';
        query += 'JOIN LOCATIONS ON PATIENTS.primary_location = LOCATIONS.location_id ';
        query += 'LEFT JOIN APPOINTMENTS ON PATIENTS.patient_id = APPOINTMENTS.patient_id ';
        query += 'WHERE PATIENTS.patient_id = ?';

        mysql.pool.query(query, [req.query.id], function(error, results, fields) {
            if (error) {
                res.write(JSON.stringify(error));
                res.end();
            }

            var result = {
                name: results[0].name, 
                birthdate: new Date(results[0].birthdate).toDateString(),
                email: results[0].email,
                phone: results[0].phone,
                doc: 'Primary Doctor: ' + results[0].doc,
                loc: 'Primary Location: ' + results[0].loc,
                edit: '/cu/patient?id=' + results[0].pid,
                delete: '/d/patient?id=' + results[0].pid,
                appt_row: []
            };

            if (!results[0].aid) {
                result.no_appts = true;
            } else {
                var current_appt = 0;

                for (var i = 0; i < results.length / 3; i++) {
                    var row =  { record: [] };
                    for (var j = 0; (j < 3 && current_appt < results.length); j++) {
                        var appt = {};
                        appt.header = days_of_the_week[results[current_appt].day_of_week] + ', ' + months[results[current_appt].month] + results[current_appt].header + ' at ' + convert_time(results[current_appt].time);
                        appt.doctor = 'With: ' + results[current_appt].doc;
                        appt.location = 'At: ' + results[current_appt].loc;
                        appt.reason = 'Reason: ' + results[current_appt].reason;
                        appt.reschedule = '/schedule?appt=' + results[current_appt].aid;
                        appt.cancel = '/cancel?appt=' + results[current_appt].aid;

                        row.record.push(appt);

                        current_appt++;
                    }
                    result.appt_row.push(row);
                }
            }

            if (req.query.ajax) {
                res.send(JSON.stringify(result));
            } else {
                mysql.pool.query('SELECT patient_id AS id, CONCAT(first_name, " ", last_name) AS name FROM PATIENTS', function(error, results, fields) {
                    if (error) {
                        res.write(JSON.stringify(error));
                        res.end();
                    }

                    result.show_detail = 'display: block;';
                    result.show_appointments = 'display: block;';
                    result.patient_select = results;
                    res.render('view-patient', result);
                });
            }
        });      
    }

    else {
        var context = { show_detail: 'display: none;', show_appointments: 'display: none;' };

        if (req.query.c) {
            context.redirect_message = 'New patient was successfully added.';
        } else if (req.query.u) {
            context.redirect_message = 'Patient was successfully updated.';
        } else if (req.query.d) {
            context.redirect_message = 'Patient was successfully deleted.';
        }

        mysql.pool.query('SELECT patient_id AS id, CONCAT(first_name, " ", last_name) AS name FROM PATIENTS', function(error, results, fields) {
            if (error) {
                res.write(JSON.stringify(error));
                res.end();
            }
    
            context.patient_select = results;
            res.render('view-patient', context);
        });
    }
});

app.get('/r/doctor', function(req, res) {
    var context = { title: 'Our Doctors', new_link: '/cu/doctor', new_label: 'Add a Doctor', row: [] };

    if (req.query.c) {
        context.redirect_message = 'New doctor was successfully added.';
    } else if (req.query.u) {
        context.redirect_message = 'Doctor was successfully updated.';
    } else if (req.query.d) {
        context.redirect_message = 'Doctor was successfully deleted.';
    }

    var query = 'SELECT DOCTORS.doctor_id AS id, title, first_name, last_name, degree, label FROM DOCTORS ';
    query += 'JOIN DOCTORS_LOCATIONS ON DOCTORS.doctor_id = DOCTORS_LOCATIONS.doctor_id ';
    query += 'JOIN LOCATIONS ON DOCTORS_LOCATIONS.location_id = LOCATIONS.location_id ORDER BY id ASC';

    mysql.pool.query(query, function(error, results, fields) {
        if (error) {
            res.write(JSON.stringify(error));
            res.end();
        }

        var current_doctor = 0;

        for (var i = 0; i < results.length / 3; i++) {
            var row =  { record: [] };
            for (var j = 0; (j < 3 && current_doctor < results.length); j++) {
                var doctor = {};
                doctor.header = results[current_doctor].title + ' ' + results[current_doctor].first_name + ' ' + results[current_doctor].last_name;
                doctor.detail = [ { text: results[current_doctor].degree } ];
                doctor.edit_link = '/cu/doctor?id=' + results[current_doctor].id;
                doctor.delete_link = '/d/doctor?id=' + results[current_doctor].id;
                doctor.list_header = 'Works At:'
                doctor.list = [];

                var id = results[current_doctor].id;
                while (current_doctor < results.length && id == results[current_doctor].id) {
                    doctor.list.push( { label: results[current_doctor].label } );
                    current_doctor++;
                }
                row.record.push(doctor);
            }
            context.row.push(row);
        }

        res.render('view-staff', context);
    });
});

app.get('/r/location', function(req, res) {
    var context = { title: 'Our Locations', new_link: '/cu/location', new_label: 'Add a Location', row: [] };

    if (req.query.c) {
        context.redirect_message = 'New location was successfully added.';
    } else if (req.query.u) {
        context.redirect_message = 'Location was successfully updated.';
    } else if (req.query.d) {
        context.redirect_message = 'Location was successfully deleted.';
    }

    var query = 'SELECT LOCATIONS.location_id AS id, label, street1, street2, city, state, zip, phone, title, first_name, last_name FROM LOCATIONS ';
    query += 'JOIN DOCTORS_LOCATIONS ON LOCATIONS.location_id = DOCTORS_LOCATIONS.location_id ';
    query += 'JOIN DOCTORS ON DOCTORS_LOCATIONS.doctor_id = DOCTORS.doctor_id ORDER BY id ASC';

    mysql.pool.query(query, function(error, results, fields) {
        if (error) {
            res.write(JSON.stringify(error));
            res.end();
        }

        var current_location = 0;

        for (var i = 0; i < results.length / 3; i++) {
            var row =  { record: [] };
            for (var j = 0; (j < 3 && current_location < results.length); j++) {
                var location = {};
                location.header = results[current_location].label;
                location.detail = [ { text: results[current_location].street1 } ];
                if (results[current_location].street2) {
                    location.detail.push( { text: results[current_location].street2 } );
                }
                location.detail.push( { text: results[current_location].city + ', ' + results[current_location].state + ' ' + results[current_location].zip } );
                location.detail.push( { text: results[current_location].phone } );
                location.edit_link = '/cu/location?id=' + results[current_location].id;
                location.delete_link = '/d/location?id=' + results[current_location].id;
                location.list_header = 'Doctors On-Site:';
                location.list = [];

                var id = results[current_location].id;
                while (current_location < results.length && id == results[current_location].id) {
                    location.list.push( { label: results[current_location].title + ' ' +  results[current_location].first_name + ' ' + results[current_location].last_name } );
                    current_location++;
                }
                row.record.push(location);
            }
            context.row.push(row);
        }

        res.render('view-staff', context);
    });
});

app.get('/manage', function(req, res) {
    var context = { location: [] };

    if (req.query.c) {
        context.redirect_message = 'New appointment slot was successfully added.';
    } else if (req.query.u) {
        context.redirect_message = 'Appointment slot was successfully updated.';
    } else if (req.query.d) {
        context.redirect_message = 'Appointment slot was successfully deleted.';
    }

    var location_args = [];
    var get_locations = 'SELECT LOCATIONS.location_id AS id, label FROM LOCATIONS';
    if (req.query.doctor) {
        get_locations += ' JOIN DOCTORS_LOCATIONS ON LOCATIONS.location_id = DOCTORS_LOCATIONS.location_id ';
        get_locations += 'JOIN DOCTORS ON DOCTORS_LOCATIONS.doctor_id = DOCTORS.doctor_id AND DOCTORS.doctor_id = ?';
        location_args.push(req.query.doctor);
    }
    get_locations += ' ORDER BY id ASC';

    mysql.pool.query(get_locations, location_args, function(error, results, fields) {
        if (error) {
            res.write(JSON.stringify(error));
            res.end();
        }

        context.location_select = results;

        var doctor_args = [];
        var get_doctors = 'SELECT DOCTORS.doctor_id AS id, CONCAT(title, " ", first_name, " ", last_name) AS name FROM DOCTORS';
        if (req.query.location) {
            get_doctors += ' JOIN DOCTORS_LOCATIONS ON DOCTORS.doctor_id = DOCTORS_LOCATIONS.doctor_id ';
            get_doctors += 'JOIN LOCATIONS ON DOCTORS_LOCATIONS.location_id = LOCATIONS.location_id AND LOCATIONS.location_id = ?';
            doctor_args.push(req.query.location);
        }
        get_doctors == ' ORDER BY id ASC';

        mysql.pool.query(get_doctors, doctor_args, function(error, results, fields) {
            if (error) {
                res.write(JSON.stringify(error));
                res.end();
            }

            context.doctor_select = results;

            var appt_args = [];

            var get_appts = 'SELECT appointment_id AS id, day_of_week, month, CONCAT(" ", day, ", ", year) AS header, time, APPOINTMENTS.patient_id AS booked, ';
            get_appts += 'APPOINTMENTS.doctor_id AS doc, CONCAT(title, " ", first_name, " ", last_name) AS doctor_name, APPOINTMENTS.location_id AS loc, label FROM APPOINTMENTS ';
            get_appts += 'JOIN DOCTORS ON APPOINTMENTS.doctor_id = DOCTORS.doctor_id ';
            if (req.query.doctor) {
                get_appts += 'AND APPOINTMENTS.doctor_id = ? ';
                appt_args.push(req.query.doctor);
            }
            get_appts += 'JOIN LOCATIONS ON APPOINTMENTS.location_id = LOCATIONS.location_id ';
            if (req.query.location) {
                get_appts += 'AND APPOINTMENTS.location_id = ? ';
                appt_args.push(req.query.location);
            }
            get_appts += 'ORDER BY loc, doc, id ASC';

            mysql.pool.query(get_appts, appt_args, function(error, results, fields) {
                if (error) {
                    res.write(JSON.stringify(error));
                    res.end();
                }

                if (results.length <= 0) {
                    context.empty = true;
                    res.render('manage', context);
                }

                else {
                    var current_appt = 0;

                    while (current_appt < results.length) {
                        var current_location = results[current_appt].loc;
                        var location_record = { label: results[current_appt].label, doctor: [], count: 0 };

                        while (current_appt < results.length && current_location == results[current_appt].loc) {
                            var current_doctor = results[current_appt].doc;
                            var doctor_record = { name: results[current_appt].doctor_name, appt: [], count: 0 };

                            while (current_appt < results.length && current_location == results[current_appt].loc && current_doctor == results[current_appt].doc) {
                                var appt_record = {};
                                appt_record.header = days_of_the_week[results[current_appt].day_of_week] + ', ' + months[results[current_appt].month] + results[current_appt].header + ' at ' + convert_time(results[current_appt].time);
                                appt_record.booked = results[current_appt].booked;
                                appt_record.edit_link = '/cu/appointment?id=' + results[current_appt].id;
                                appt_record.delete_link = '/d/appointment?id=' + results[current_appt].id;

                                doctor_record.appt.push(appt_record);
                                current_appt++;
                                doctor_record.count++;
                                location_record.count++;
                            }

                            location_record.doctor.push(doctor_record);
                        }

                        context.location.push(location_record);
                    }

                    res.render('manage', context);
                }
            });
        });
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

function to_ISO(date) {
    return new Date(date).toISOString().substring(0, 10);
}

function get_year(date) {
    return Number(date.substring(0, 4));
}

function get_month(date) {
    return Number(date.substring(5, 7));
}

function get_day(date) {
    return Number(date.substring(8, 10));
}

function get_day_of_week(date) {
    return new Date(date).getDay();
}

function convert_time(time) {
    var hour = Number(time.substring(0, 2));
    var post;

    if (hour == 0) {
        hour += 12;
        post = 'AM';
    } else if (hour > 12) {
        hour -= 12;
        post = 'PM';
    } else {
        post = 'AM';
    }

    return String(hour) + ":" + time.substring(3, 5) + " " + post;
}