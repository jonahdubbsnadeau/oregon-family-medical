var express = require('express');
var handlebars = require('express-handlebars').create({ defaultLayout: 'layout' });
var bodyParser = require('body-parser');
var mysql = require('./dbcon.js');

var app = express();
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');
app.set('port', process.env.PORT || 8080);
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

var days_of_the_week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
var months = [null, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

app.route('/').get(function(req, res) { res.render('home', {}); });
app.route('/schedule').get(schedule_page).post(schedule);
app.route('/schedule/success').get(schedule_success);
app.route('/cu/patient').get(cu_patients_page).post(cu_patient);
app.route('/cu/doctor').get(cu_doctors_page).post(cu_doctor);
app.route('/cu/location').get(cu_locations_page).post(cu_location);
app.route('/cu/appointment').get(cu_appts_page).post(cu_appt);
app.route('/r/patient').get(read_patients);
app.route('/r/doctor').get(read_doctors);
app.route('/r/location').get(read_locations);
app.route('/d/patient').get(delete_patients_page).post(delete_patient);
app.route('/d/doctor').get(delete_doctors_page).post(delete_doctor);
app.route('/d/location').get(delete_locations_page).post(delete_location);
app.route('/d/appointment').get(delete_appts_page).post(delete_appt);
app.route('/manage').get(manage_page);
app.post('/cancel', unschedule);
app.post('/reschedule', reschedule);
app.route('/doctors_locations').get(doctors_locations);

async function schedule(req, res) {
    await mysql.pool.query('UPDATE APPOINTMENTS SET patient_id = ?, chief_complaint = ? WHERE appointment_id = ?', [req.body.patient, req.body.reason, req.body.appt]);
    res.redirect('/schedule/success?appt=' + req.body.appt);
}

async function unschedule(req, res) {
    await mysql.pool.query('UPDATE APPOINTMENTS SET patient_id = NULL, chief_complaint = NULL WHERE appointment_id = ?', [req.body.appt]);
    res.end();
}

async function reschedule(req, res) {
    await mysql.pool.query('UPDATE APPOINTMENTS SET patient_id = NULL, chief_complaint = NULL WHERE appointment_id = ?', [req.body.old]);
    await mysql.pool.query('UPDATE APPOINTMENTS SET patient_id = ?, chief_complaint = ? WHERE appointment_id = ?', [req.body.patient, req.body.reason, req.body.appt]);
    res.redirect('/schedule/success?appt=' + req.body.appt);
}

async function schedule_page(req, res) {
    if (req.query.ajax) {
        // AJAX request for available times on a given date
        if (req.query.year) {
            var data = await mysql.pool.query('SELECT appointment_id AS id, time FROM APPOINTMENTS WHERE patient_id IS NULL AND doctor_id = ? AND location_id = ? AND year = ? AND month = ? AND day = ?', [req.query.doctor, req.query.location, req.query.year, req.query.month, req.query.day]);
            res.send(JSON.stringify(data[0]));
        }
        
        // AJAX request for dates of available appointments
        else if (req.query.patient) {
            // Get primary doctor and location
            var query = 'SELECT DOCTORS.doctor_id AS did, CONCAT(DOCTORS.title, " ", DOCTORS.first_name, " ", DOCTORS.last_name) AS doctor, LOCATIONS.location_id AS lid, LOCATIONS.label AS location FROM PATIENTS ';
            query += 'JOIN DOCTORS ON PATIENTS.primary_doctor = DOCTORS.doctor_id AND PATIENTS.patient_id = ? ';
            query += 'JOIN LOCATIONS ON PATIENTS.primary_location = LOCATIONS.location_id AND PATIENTS.patient_id = ?';

            var dl_data = await mysql.pool.query(query, [req.query.patient, req.query.patient]);
            
            var result = {
                did: dl_data[0][0].did,
                doctor: dl_data[0][0].doctor,
                lid: dl_data[0][0].lid,
                location: dl_data[0][0].location
            };

            // Get available appointments
            var available_appts = await mysql.pool.query('SELECT CONCAT(year, "-", month, "-", day) AS date FROM APPOINTMENTS WHERE patient_id IS NULL AND doctor_id = ? AND location_id = ? GROUP BY year, month, day', [result.did, result.lid]);
            result.dates = available_appts[0];
            res.send(JSON.stringify(result));
        }
    }

    // Rescheduling appointment; patient is pre-selected and cannot be changed
    else if (req.query.appt) {
        var p_data = await mysql.pool.query('SELECT first_name, last_name FROM PATIENTS WHERE patient_id = ?', [req.query.patient]);
        res.render('schedule', {
            current_patient: req.query.patient,
            current_patient_name: p_data[0][0].first_name + ' ' + p_data[0][0].last_name,
            old_appt: req.query.appt
        });
    }

    else {
        var p_data = await mysql.pool.query('SELECT patient_id AS option_value, CONCAT(first_name, " ", last_name) AS option_text FROM PATIENTS WHERE primary_doctor IS NOT NULL AND primary_location IS NOT NULL');
            
        if (req.query.patient) {
            // Patient is pre-selected
            res.render('schedule', { current_patient: req.query.patient, patient_option: p_data[0] });
        } else {
            res.render('schedule', { patient_option: p_data[0] });
        }
    }
}

async function schedule_success(req, res) {
    var query = 'SELECT PATIENTS.patient_id AS pid, PATIENTS.first_name AS pfname, PATIENTS.last_name AS plname, year, month, day, time, day_of_week, title AS dtitle, DOCTORS.first_name AS dfname, DOCTORS.last_name AS dlname, label AS location FROM APPOINTMENTS ';
    query += 'JOIN PATIENTS ON APPOINTMENTS.patient_id = PATIENTS.patient_id ';
    query += 'JOIN DOCTORS ON APPOINTMENTS.doctor_id = DOCTORS.doctor_id ';
    query += 'JOIN LOCATIONS ON APPOINTMENTS.location_id = LOCATIONS.location_id ';
    query += 'WHERE appointment_id = ?';

    var data = await mysql.pool.query(query, [req.query.appt]);
    var appt = data[0][0];
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
}

async function manage_page(req, res) {
    var context = { location: [] };

    if (req.query.c) {
        context.redirect_message = 'New appointment slot was successfully added.';
    } else if (req.query.u) {
        context.redirect_message = 'Appointment slot was successfully updated.';
    } else if (req.query.d) {
        context.redirect_message = 'Appointment slot was successfully deleted.';
    }

    var location_args = [];
    var get_locations = 'SELECT LOCATIONS.location_id AS option_value, label AS option_text FROM LOCATIONS';
    if (req.query.doctor) {
        get_locations += ' JOIN DOCTORS_LOCATIONS ON LOCATIONS.location_id = DOCTORS_LOCATIONS.location_id ';
        get_locations += 'JOIN DOCTORS ON DOCTORS_LOCATIONS.doctor_id = DOCTORS.doctor_id AND DOCTORS.doctor_id = ?';
        location_args.push(req.query.doctor);
    }
    get_locations += ' ORDER BY option_value ASC';

    var location_list = await mysql.pool.query(get_locations, location_args);
    context.location_select = location_list[0];

    var doctor_args = [];
    var get_doctors = 'SELECT DOCTORS.doctor_id AS option_value, CONCAT(title, " ", first_name, " ", last_name) AS option_text FROM DOCTORS';
    if (req.query.location) {
        get_doctors += ' JOIN DOCTORS_LOCATIONS ON DOCTORS.doctor_id = DOCTORS_LOCATIONS.doctor_id ';
        get_doctors += 'JOIN LOCATIONS ON DOCTORS_LOCATIONS.location_id = LOCATIONS.location_id AND LOCATIONS.location_id = ?';
        doctor_args.push(req.query.location);
    }
    get_doctors == ' ORDER BY option_value ASC';

    var doctor_list = await mysql.pool.query(get_doctors, doctor_args);
    context.doctor_select = doctor_list[0];

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

    var appt_list = await mysql.pool.query(get_appts, appt_args);
    var results = appt_list[0];

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
}

async function cu_patients_page(req, res) {
    var context = {
        opt_script: 'doctors_locations.js',
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

    var doctor_list = await mysql.pool.query('SELECT doctor_id AS option_value, CONCAT(title, " ", first_name, " ", last_name) AS option_text FROM DOCTORS');
    context.item.push( { id: 'doc', name: 'doc', select: true, label: 'Primary Doctor', option: doctor_list[0] } );

    var location_list = await mysql.pool.query('SELECT location_id AS option_value, label AS option_text FROM LOCATIONS');
    context.item.push( { id: 'loc', name: 'loc', select: true, label: 'Primary Location', option: location_list[0] } );

    if (req.query.id) {
        var data = await mysql.pool.query('SELECT patient_id, first_name, last_name, birthdate, email, phone FROM PATIENTS WHERE patient_id = ?', [req.query.id]);
        var patient_details = data[0][0];

        context.form_header = 'Edit a Patient';
        context.existing_id = patient_details.patient_id;
        context.item[0].preset = patient_details.first_name;
        context.item[1].preset = patient_details.last_name;
        context.item[2].preset = to_ISO(patient_details.birthdate);
        context.item[3].preset = patient_details.email;
        context.item[4].preset = patient_details.phone;

        res.render('add-edit', context);
    } else {
        context.form_header = 'Add a Patient'
        res.render('add-edit', context);
    }
}

async function cu_patient(req, res) {
    if (req.body.existing) {
        var sql = "UPDATE PATIENTS SET first_name = ?, last_name = ?, birthdate = ?, email = ?, phone = ?, primary_doctor = ?, primary_location = ? WHERE patient_id = ?";
        var values = [req.body.fname, req.body.lname, req.body.bdate, req.body.eaddress, req.body.phone, req.body.doc, req.body.loc, req.body.existing];

        await mysql.pool.query(sql, values);
        res.redirect('/r/patient?id=' + req.body.existing + '&u=success');
    } else {
        var sql = "INSERT INTO PATIENTS (first_name, last_name, birthdate, email, phone, primary_doctor, primary_location) VALUES (?,?,?,?,?,?,?)";
        var inserts = [req.body.fname, req.body.lname, req.body.bdate, req.body.eaddress, req.body.phone, req.body.doc, req.body.loc];

        await mysql.pool.query(sql, inserts);
        res.redirect('/r/patient?c=success');
    }
}

async function cu_doctors_page(req, res) {
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

    var data = await mysql.pool.query('SELECT location_id, label FROM LOCATIONS');
    var location = data[0];

    context.checkbox = [];
    context.checklist_header = 'Location(s):';
    
    for (var i = 0; i < location.length; i++) {
        context.checkbox.push({ 
            id: location[i].location_id,
            name: location[i].location_id,
            label: location[i].label,
        });
    }

    if (req.query.id) {
        var doctor_data = await mysql.pool.query('SELECT doctor_id, title, first_name, last_name, degree FROM DOCTORS WHERE doctor_id = ?', [req.query.id]);
        var doctor = doctor_data[0][0];

        context.form_header = 'Edit a Doctor';
        context.existing_id = doctor.doctor_id;
        context.item[0].preset = doctor.title;
        context.item[1].preset = doctor.first_name;
        context.item[2].preset = doctor.last_name;
        context.item[3].preset = doctor.degree;

        res.render('add-edit', context);
    } else {
        context.form_header = 'Add a Doctor';
        res.render('add-edit', context);
    }
}

async function cu_doctor(req, res) {
    if (req.body.existing) {
        var sql = "UPDATE DOCTORS SET title = ?, first_name = ?, last_name = ?, degree = ? WHERE doctor_id = ?";
        var values = [req.body.title, req.body.fname, req.body.lname, req.body.degree, req.body.existing];
        await mysql.pool.query(sql, values);

        // Delete old relationships
        var old = await mysql.pool.query('SELECT id FROM DOCTORS_LOCATIONS WHERE doctor_id = ?', [req.body.existing]);
        var old_location = old[0];

        for (var i = 0; i < old_location.length; i++) {
            await mysql.pool.query('DELETE FROM DOCTORS_LOCATIONS WHERE id = ?', [old_location[i].id]);
        }

        // Add new relationships
        var new_location = Object.keys(req.body);
        var j = 0;

        while (new_location[j] != 'existing') {
            await mysql.pool.query('INSERT INTO DOCTORS_LOCATIONS (doctor_id, location_id) VALUES (?,?)', [req.body.existing, new_location[j]]);
            j++;
        }

        res.redirect('/r/doctor?u=success');
    } else {
        var sql = "INSERT INTO DOCTORS (title, first_name, last_name, degree) VALUES (?,?,?,?)";
        var values = [req.body.title, req.body.fname, req.body.lname, req.body.degree];

        await mysql.pool.query(sql, values);
        var new_doctor = await mysql.pool.query('SELECT LAST_INSERT_ID() AS id');
        var new_location = Object.keys(req.body);
        var j = 0;

        while (new_location[j] != 'title') {
            await mysql.pool.query('INSERT INTO DOCTORS_LOCATIONS (doctor_id, location_id) VALUES (?,?)', [new_doctor[0][0].id, new_location[j]]);
            j++;
        }

        res.redirect('/r/doctor?c=success');
    }
}

async function cu_locations_page(req, res) {
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

    var data = await mysql.pool.query('SELECT doctor_id, CONCAT(title, " ", first_name, " ", last_name) AS name FROM DOCTORS');
    var doctor_list = data[0];

    context.checkbox = [];
    context.checklist_header = 'Doctor(s):';
    
    for (var i = 0; i < doctor_list.length; i++) {
        context.checkbox.push({ 
            id: doctor_list[i].doctor_id,
            name: doctor_list[i].doctor_id,
            label: doctor_list[i].name,
        });
    }

    if (req.query.id) {
        var loc_data = await mysql.pool.query('SELECT location_id, label, street1, street2, city, state, zip, phone FROM LOCATIONS WHERE location_id = ?', [req.query.id]);
        var location = loc_data[0][0];
        context.form_header = 'Edit a Location';
        context.existing_id = location.location_id;
        context.item[0].preset = location.label;
        context.item[1].preset = location.street1;
        if (location.street2) {
            context.item[2].preset = location.street2;
        }
        context.item[3].preset = location.city;
        context.item[4].preset = location.state;
        context.item[5].preset = location.zip;
        context.item[6].preset = location.phone;

        res.render('add-edit', context);
    } else {
        context.form_header = 'Add a Location';
        res.render('add-edit', context);
    }
}

async function cu_location(req, res) {
    if (req.body.existing) {
        var sql, values;
        
        if (!req.body.street2 || req.body.street2 == '') {
            sql = 'UPDATE LOCATIONS SET label = ?, street1 = ?, street2 = NULL, city = ?, state = ?, zip = ?, phone = ? WHERE location_id = ?';
            values = [req.body.label, req.body.street1, req.body.city, req.body.state, req.body.zip, req.body.phone, req.body.existing];
        } else {
            sql = 'UPDATE LOCATIONS SET label = ?, street1 = ?, street2 = ?, city = ?, state = ?, zip = ?, phone = ? WHERE location_id = ?';
            values = [req.body.label, req.body.street1, req.body.street2, req.body.city, req.body.state, req.body.zip, req.body.phone, req.body.existing];
        }
        
        await mysql.pool.query(sql, values);

        // Delete old relationships
        var old = await mysql.pool.query('SELECT id FROM DOCTORS_LOCATIONS WHERE location_id = ?', [req.body.existing]);
        var old_doctor = old[0];

        for (var i = 0; i < old_doctor.length; i++) {
            await mysql.pool.query('DELETE FROM DOCTORS_LOCATIONS WHERE id = ?', [old_doctor[i].id]);
        }

        // Add new relationships
        var new_doctor = Object.keys(req.body);
        var j = 0;

        while (new_doctor[j] != 'existing') {
            await mysql.pool.query('INSERT INTO DOCTORS_LOCATIONS (doctor_id, location_id) VALUES (?,?)', [new_doctor[j], req.body.existing]);
            j++;
        }

        res.redirect('/r/location?u=success');
    } else {
        var sql, inserts;
        
        if (!req.body.street2 || req.body.street2 == '') {
            sql = "INSERT INTO LOCATIONS (label, street1, city, state, zip, phone) VALUES (?,?,?,?,?,?)";
            inserts = [req.body.label, req.body.street1, req.body.city, req.body.state, req.body.zip, req.body.phone];
        } else {
            sql = "INSERT INTO LOCATIONS (label, street1, street2, city, state, zip, phone) VALUES (?,?,?,?,?,?,?)";
            inserts = [req.body.label, req.body.street1, req.body.street2, req.body.city, req.body.state, req.body.zip, req.body.phone];
        }
        
        await mysql.pool.query(sql, inserts);
        var new_location = await mysql.pool.query('SELECT LAST_INSERT_ID() AS id');
        var doctor = Object.keys(req.body);
        var i = 0;

        while (doctor[i] != 'label') {
            await mysql.pool.query('INSERT INTO DOCTORS_LOCATIONS (doctor_id, location_id) VALUES (?,?)', [doctor[i], new_location[0][0].id]);
            i++;
        }

        res.redirect('/r/location?c=success');
    }
}

async function cu_appts_page(req, res) {
    var context = {
        opt_script: 'doctors_locations.js',
        form_action: '/cu/appointment',
        form_method: 'POST',
        item: [
            { id: 'time', name: 'time', type: 'time', required: true, label: 'Appointment Time' },
            { id: 'date', name: 'date', type: 'date', required: true, label: 'Appointment Date' }
        ]
    };

    var doctor_list = await mysql.pool.query('SELECT doctor_id AS option_value, CONCAT(title, " ", first_name, " ", last_name) AS option_text FROM DOCTORS');
    context.item.push( { id: 'doc', name: 'doc', select: true, label: 'Doctor', option: doctor_list[0] } );

    var location_list = await mysql.pool.query('SELECT location_id AS option_value, label AS option_text FROM LOCATIONS');
    context.item.push( { id: 'loc', name: 'loc', select: true, label: 'Location', option: location_list[0] } );

    if (req.query.id) {
        var data = await mysql.pool.query('SELECT appointment_id, time, year, month, day FROM APPOINTMENTS WHERE appointment_id = ?', [req.query.id]);
        var appt = data[0][0];

        context.form_header = 'Edit an Appointment';
        context.existing_id = appt.appointment_id;

        context.item[0].preset = appt.time;

        var date = "" + appt.year + "-";
        if (appt.month < 10) {
            date += "0";
        }
        date += appt.month + "-";
        if (appt.day < 10) {
            date += "0";
        }
        date += appt.day;

        context.item[1].preset = date;

        res.render('add-edit', context);
    } else {
        context.form_header = 'Add an Appointment';
        res.render('add-edit', context);
    }
}

async function cu_appt(req, res) {
    if (req.body.existing) {
        var sql = "UPDATE APPOINTMENTS SET doctor_id = ?, location_id = ?, time = ?, year = ?, month = ?, day = ?, day_of_week = ? WHERE appointment_id = ?";
        var values = [req.body.doc, req.body.loc, req.body.time, get_year(req.body.date), get_month(req.body.date), get_day(req.body.date), get_day_of_week(req.body.date), req.body.existing];
        
        await mysql.pool.query(sql, values);
        res.redirect('/manage?u=success');
    } else {
        var sql = "INSERT INTO APPOINTMENTS (doctor_id, location_id, time, year, month, day, day_of_week) VALUES (?,?,?,?,?,?,?)";
        var inserts = [req.body.doc, req.body.loc, req.body.time, get_year(req.body.date), get_month(req.body.date), get_day(req.body.date), get_day_of_week(req.body.date)];
        
        await mysql.pool.query(sql, inserts);
        res.redirect('/manage?c=success');
    }
}

async function read_patients(req, res) {
    if (req.query.id) {
        var query = 'SELECT PATIENTS.patient_id AS pid, CONCAT(PATIENTS.first_name, " ", PATIENTS.last_name) AS name, birthdate, email, PATIENTS.phone AS phone, ';
        query += 'CONCAT(title, " ", DOCTORS.first_name, " ", DOCTORS.last_name) AS doc, label AS loc, ';
        query += 'appointment_id AS aid, day_of_week, month, CONCAT(" ", day, ", ", year) AS header, time, chief_complaint AS reason FROM PATIENTS ';
        query += 'LEFT JOIN DOCTORS ON PATIENTS.primary_doctor = DOCTORS.doctor_id ';
        query += 'LEFT JOIN LOCATIONS ON PATIENTS.primary_location = LOCATIONS.location_id ';
        query += 'LEFT JOIN APPOINTMENTS ON PATIENTS.patient_id = APPOINTMENTS.patient_id ';
        query += 'WHERE PATIENTS.patient_id = ?';

        var data = await mysql.pool.query(query, [req.query.id]);
        var appointments = data[0];
        var patient_details = data[0][0];

        var result = {
            name: patient_details.name, 
            birthdate: new Date(patient_details.birthdate).toDateString(),
            email: patient_details.email,
            phone: patient_details.phone,
            edit: '/cu/patient?id=' + patient_details.pid,
            delete: '/d/patient?id=' + patient_details.pid,
            appt_row: []
        };

        if (patient_details.doc) {
            result.doc = patient_details.doc;
        } else {
            result.doc = null;
        }
        
        if (patient_details.loc) {
            result.loc = patient_details.loc;
        } else {
            result.loc = null;
        }

        if (!patient_details.aid) {
            result.no_appts = true;
        } else {
            var current_appt = 0;

            for (var i = 0; i < appointments.length / 3; i++) {
                var row =  { record: [] };
                for (var j = 0; (j < 3 && current_appt < appointments.length); j++) {
                    var appt = {};
                    appt.header = days_of_the_week[appointments[current_appt].day_of_week] + ', ' + months[appointments[current_appt].month] + appointments[current_appt].header + ' at ' + convert_time(appointments[current_appt].time);
                    appt.doctor = 'With: ' + appointments[current_appt].doc;
                    appt.location = 'At: ' + appointments[current_appt].loc;
                    appt.reason = 'Reason: ' + appointments[current_appt].reason;
                    appt.reschedule = '/schedule?appt=' + appointments[current_appt].aid + '&patient=' + patient_details.pid;
                    appt.appt = appointments[current_appt].aid;
                    appt.patient = patient_details.pid;

                    row.record.push(appt);

                    current_appt++;
                }
                result.appt_row.push(row);
            }
        }

        if (req.query.ajax) {
            res.send(JSON.stringify(result));
        } else {
            var patient_list = await mysql.pool.query('SELECT patient_id AS option_value, CONCAT(first_name, " ", last_name) AS option_text FROM PATIENTS');
            result.show_detail = 'display: block;';
            result.show_appointments = 'display: block;';
            result.patient_select = patient_list[0];

            if (req.query.cancel) {
                result.redirect_message = 'Appointment has been cancelled.';
            } else if (req.query.u) {
                result.redirect_message = 'Patient was successfully updated.';
            }

            res.render('view-patient', result);
        }
    }

    else {
        var context = { show_detail: 'display: none;', show_appointments: 'display: none;' };

        if (req.query.c) {
            context.redirect_message = 'New patient was successfully added.';
        } else if (req.query.d) {
            context.redirect_message = 'Patient was successfully deleted.';
        }

        var patient_list = await mysql.pool.query('SELECT patient_id AS option_value, CONCAT(first_name, " ", last_name) AS option_text FROM PATIENTS');
        context.patient_select = patient_list[0];
        res.render('view-patient', context);
    }
}

async function read_doctors(req, res) {
    var context = { title: 'Our Doctors', new_link: '/cu/doctor', new_label: 'Add a Doctor', row: [] };

    if (req.query.c) {
        context.redirect_message = 'New doctor was successfully added.';
    } else if (req.query.u) {
        context.redirect_message = 'Doctor was successfully updated.';
    } else if (req.query.d) {
        context.redirect_message = 'Doctor was successfully deleted.';
    }

    var query = 'SELECT DOCTORS.doctor_id AS id, title, first_name, last_name, degree, label FROM DOCTORS ';
    query += 'LEFT JOIN DOCTORS_LOCATIONS ON DOCTORS.doctor_id = DOCTORS_LOCATIONS.doctor_id ';
    query += 'LEFT JOIN LOCATIONS ON DOCTORS_LOCATIONS.location_id = LOCATIONS.location_id ORDER BY id ASC';

    var data = await mysql.pool.query(query);
    var results = data[0];

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
                if (!results[current_doctor].label) {
                    doctor.list_header += ' none';
                } else {
                    doctor.list.push( { label: results[current_doctor].label } );
                }
                
                current_doctor++;
            }
            row.record.push(doctor);
        }
        context.row.push(row);
    }

    res.render('view-staff', context);
}

async function read_locations(req, res) {
    var context = { title: 'Our Locations', new_link: '/cu/location', new_label: 'Add a Location', row: [] };

    if (req.query.c) {
        context.redirect_message = 'New location was successfully added.';
    } else if (req.query.u) {
        context.redirect_message = 'Location was successfully updated.';
    } else if (req.query.d) {
        context.redirect_message = 'Location was successfully deleted.';
    }

    var query = 'SELECT LOCATIONS.location_id AS id, label, street1, street2, city, state, zip, phone, title, first_name, last_name FROM LOCATIONS ';
    query += 'LEFT JOIN DOCTORS_LOCATIONS ON LOCATIONS.location_id = DOCTORS_LOCATIONS.location_id ';
    query += 'LEFT JOIN DOCTORS ON DOCTORS_LOCATIONS.doctor_id = DOCTORS.doctor_id ORDER BY id ASC';

    var data = await mysql.pool.query(query);
    var results = data[0];
    
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
                if (!results[current_location].title) {
                    location.list_header += ' none';
                } else {
                    location.list.push( { label: results[current_location].title + ' ' +  results[current_location].first_name + ' ' + results[current_location].last_name } );
                }
                
                current_location++;
            }
            row.record.push(location);
        }
        context.row.push(row);
    }

    res.render('view-staff', context);
}

async function delete_patients_page(req, res, next) {
    if (!req.query.id) {
        next();
    }

    var data = await mysql.pool.query('SELECT CONCAT(first_name, " ", last_name) AS patient FROM PATIENTS WHERE patient_id = ?', [req.query.id]);

    // In case a non-existent id is somehow entered
    if (!data || data[0].length <= 0) {
        next();
    }

    var context = {
        title: 'Delete Patient',
        detail: data[0][0].patient,
        msg1: 'Are you sure you want to delete this patient? This action cannot be undone.',
        msg2: 'Any appointments that this patient has booked will become available for others to book.',
        proceed_form_action: '/d/patient',
        cancel_form_action: '/r/patient',
        input: req.query.id
    };

    res.render('delete', context);
}

async function delete_patient(req, res) {
    // Unschedule appointments scheduled by this patient
    var data = await mysql.pool.query('SELECT appointment_id AS aid FROM APPOINTMENTS WHERE patient_id = ?', [req.body.id]);
    var patient_appts = data[0];
    
    for (var i = 0; i < patient_appts.length; i++) {
        await mysql.pool.query('UPDATE APPOINTMENTS SET patient_id = NULL, chief_complaint = NULL WHERE appointment_id = ?', [patient_appts[i].aid]);
    }

    // Finally, delete patient
    await mysql.pool.query('DELETE FROM PATIENTS WHERE patient_id = ?', [req.body.id]);
    res.redirect('/r/patient?d=success');
}

async function delete_doctors_page(req, res, next) {
    if (!req.query.id) {
        next();
    }

    var data = await mysql.pool.query('SELECT CONCAT(title, " ", first_name, " ", last_name) AS doctor FROM DOCTORS WHERE doctor_id = ?', [req.query.id]);

    // In case a non-existent id is somehow entered
    if (!data || data[0].length <= 0) {
        next();
    }

    var context = {
        title: 'Delete Doctor',
        detail: data[0][0].doctor,
        msg1: 'Are you sure you want to delete this doctor? This action cannot be undone.',
        msg2: 'Any appointments with this doctor will be deleted, and any patients who have this doctor as their primary doctor will need to choose a new primary.',
        proceed_form_action: '/d/doctor',
        cancel_form_action: '/r/doctor',
        input: req.query.id
    };

    res.render('delete', context);
}

async function delete_doctor(req, res) {
    // Delete appointments with this doctor
    var appt_data = await mysql.pool.query('SELECT appointment_id AS aid FROM APPOINTMENTS WHERE doctor_id = ?', [req.body.id]);
    var appts = appt_data[0];

    for (var i = 0; i < appts.length; i++) {
        await mysql.pool.query('DELETE FROM APPOINTMENTS WHERE appointment_id = ?', [appts[i].aid]);
    }

    // Update patients who have this doctor as their primary
    var patient_data = await mysql.pool.query('SELECT patient_id AS pid FROM PATIENTS WHERE primary_doctor = ?', [req.body.id]);
    var patients = patient_data[0];

    for (var j = 0; j < patients.length; j++) {
        await mysql.pool.query('UPDATE PATIENTS SET primary_doctor = NULL WHERE patient_id = ?', [patients[j].pid]);
    }

    // Remove all relationships between a location and this doctor
    var location_data = await mysql.pool.query('SELECT id FROM DOCTORS_LOCATIONS WHERE doctor_id = ?', [req.body.id]);
    var locations = location_data[0];

    for (var k = 0; k < locations.length; k++) {
        await mysql.pool.query('DELETE FROM DOCTORS_LOCATIONS WHERE id = ?', [locations[k].id]);
    }

    // Finally, delete doctor
    await mysql.pool.query('DELETE FROM DOCTORS WHERE doctor_id = ?', [req.body.id]);
    res.redirect('/r/doctor?d=success');
}

async function delete_locations_page(req, res, next) {
    if (!req.query.id) {
        next();
    }

    var data = await mysql.pool.query('SELECT label FROM LOCATIONS WHERE location_id = ?', [req.query.id]);

    // In case a non-existent id is somehow entered
    if (!data || data[0].length <= 0) {
        next();
    }

    var context = {
        title: 'Delete Location',
        detail: data[0][0].label,
        msg1: 'Are you sure you want to delete this location? This action cannot be undone.',
        msg2: 'Any appointments at this location will be deleted, and any patients who have this location as their primary location will need to choose a new primary.',
        proceed_form_action: '/d/location',
        cancel_form_action: '/r/location',
        input: req.query.id
    };

    res.render('delete', context);
}

async function delete_location(req, res) {
    // Delete appointments at this location
    var appt_data = await mysql.pool.query('SELECT appointment_id AS aid FROM APPOINTMENTS WHERE location_id = ?', [req.body.id]);
    var appts = appt_data[0];

    for (var i = 0; i < appts.length; i++) {
        await mysql.pool.query('DELETE FROM APPOINTMENTS WHERE appointment_id = ?', [appts[i].aid]);
    }

    // Update patients who have this location as their primary
    var patient_data = await mysql.pool.query('SELECT patient_id AS pid FROM PATIENTS WHERE primary_location = ?', [req.body.id]);
    var patients = patient_data[0];

    for (var j = 0; j < patients.length; j++) {
        await mysql.pool.query('UPDATE PATIENTS SET primary_location = NULL WHERE patient_id = ?', [patients[j].pid]);
    }

    // Remove all relationships between a doctor and this location
    var doctor_data = await mysql.pool.query('SELECT id FROM DOCTORS_LOCATIONS WHERE location_id = ?', [req.body.id]);
    var doctors = doctor_data[0];

    for (var k = 0; k < doctors.length; k++) {
        await mysql.pool.query('DELETE FROM DOCTORS_LOCATIONS WHERE id = ?', [doctors[k].id]);
    }

    // Finally, delete location
    await mysql.pool.query('DELETE FROM LOCATIONS WHERE location_id = ?', [req.body.id]);
    res.redirect('/r/location?d=success');
}

async function delete_appts_page(req, res, next) {
    if (!req.query.id) {
        next();
    }

    var query = 'SELECT CONCAT(" ", day, ", ", year) AS header, month, time, day_of_week, ';
    query += 'CONCAT(title, " ", first_name, " ", last_name) AS doctor, ';
    query += 'label AS location FROM APPOINTMENTS ';
    query += 'JOIN DOCTORS ON APPOINTMENTS.doctor_id = DOCTORS.doctor_id ';
    query += 'JOIN LOCATIONS ON APPOINTMENTS.location_id = LOCATIONS.location_id ';
    query += 'WHERE appointment_id = ?';

    var data = await mysql.pool.query(query, [req.query.id]);

    // In case a non-existent id is somehow entered
    if (!data || data[0].length <= 0) {
        next();
    }

    var appt = data[0][0];
    var detail = days_of_the_week[appt.day_of_week] + ', ' + months[appt.month] + appt.header + ' at ' + convert_time(appt.time);
    detail += ' with ' + appt.doctor + ' at ' + appt.location;

    var context = {
        title: 'Delete Appointment',
        detail: detail,
        msg1: 'Are you sure you want to delete this appointment?',
        msg2: 'This action cannot be undone.',
        proceed_form_action: '/d/appointment',
        cancel_form_action: '/manage',
        input: req.query.id
    };

    res.render('delete', context);
}

async function delete_appt(req, res) {
    await mysql.pool.query('DELETE FROM APPOINTMENTS WHERE appointment_id = ?', [req.body.id]);
    res.redirect('/manage?d=success');
}

async function doctors_locations(req, res) {
    if (req.query.doc) {
        if (req.query.doc == "all") {
            var location_list = await mysql.pool.query('SELECT location_id AS option_value, label AS option_text FROM LOCATIONS ORDER BY option_value ASC');
            res.send(JSON.stringify(location_list[0]));
        } else {
            var query = 'SELECT LOCATIONS.location_id AS option_value, label AS option_text FROM LOCATIONS ';
            query += 'JOIN DOCTORS_LOCATIONS ON LOCATIONS.location_id = DOCTORS_LOCATIONS.location_id ';
            query += 'JOIN DOCTORS ON DOCTORS_LOCATIONS.doctor_id = DOCTORS.doctor_id AND DOCTORS.doctor_id = ? ';
            query += 'ORDER BY option_value ASC';

            var location_list = await mysql.pool.query(query, [req.query.doc]);
            res.send(JSON.stringify(location_list[0]));
        }

    } else if (req.query.loc) {
        if (req.query.loc == "all") {
            var doctor_list = await mysql.pool.query('SELECT doctor_id AS option_value, CONCAT(title, " ", first_name, " ", last_name) AS option_text FROM DOCTORS ORDER BY option_value ASC');
            res.send(JSON.stringify(doctor_list[0]));
        } else {
            var query = 'SELECT DOCTORS.doctor_id AS option_value, CONCAT(title, " ", first_name, " ", last_name) AS option_text FROM DOCTORS ';
            query += 'JOIN DOCTORS_LOCATIONS ON DOCTORS.doctor_id = DOCTORS_LOCATIONS.doctor_id ';
            query += 'JOIN LOCATIONS ON DOCTORS_LOCATIONS.location_id = LOCATIONS.location_id AND LOCATIONS.location_id = ? ';
            query += 'ORDER BY option_value ASC';

            var doctor_list = await mysql.pool.query(query, [req.query.loc]);
            res.send(JSON.stringify(doctor_list[0]));
        }
    }
}

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
    } else if (hour < 12) {
        post = 'AM';
    } else {
        post = 'PM';
    }

    return String(hour) + ":" + time.substring(3, 5) + " " + post;
}