document.getElementById("patientSelect").addEventListener("change", function(event) {
    var redirect = document.getElementsByClassName("redirect");
    if (redirect.length > 0) {
        for (var i = 0; i < redirect.length; i++) {
            redirect[i].style.display = "none";
        }
    }

    if (document.getElementById("patientSelect").value == "0") {
        document.getElementById("detail").style.display = "none";
        document.getElementById("appointments").style.display = "none";
    } else {
        var patientID = document.getElementById("patientSelect").value;
        displayDetails(patientID);
    }
});

function displayDetails(id) {
    var req = new XMLHttpRequest();
    req.open('GET', '/r/patient?ajax=true&id=' + id, true);
    req.setRequestHeader('Content-Type', 'application/json');
    req.addEventListener('load', function() {
        if (req.status >= 200 && req.status < 400) {
            var details = JSON.parse(req.responseText);

            document.getElementById("patientName").textContent = details.name;
            document.getElementById("birthdate").textContent = details.birthdate;
            document.getElementById("email").textContent = details.email;
            document.getElementById("phone").textContent = details.phone;

            document.getElementById("primaryDoctor").textContent = "Primary Doctor: ";
            if (details.doc) {
                document.getElementById("primaryDoctor").textContent += details.doc;
            } else {
                var choose = document.createElement("a");
                choose.setAttribute("href", details.edit);
                choose.textContent = "Choose";
                document.getElementById("primaryDoctor").appendChild(choose);
            }
            
            document.getElementById("primaryLocation").textContent = "Primary Location: ";
            if (details.loc) {
                document.getElementById("primaryLocation").textContent += details.loc;
            } else {
                var choose = document.createElement("a");
                choose.setAttribute("href", details.edit);
                choose.textContent = "Choose";
                document.getElementById("primaryLocation").appendChild(choose);
            }

            document.getElementById("editLink").setAttribute("href", details.edit);
            document.getElementById("deleteLink").setAttribute("href", details.delete);

            var container = document.getElementById("appointments").children[1];
            document.getElementById("appointments").removeChild(container);
            container = document.createElement("div");

            if (details.no_appts) {
                var message = document.createElement("div");
                message.textContent = "No appointments scheduled.";
                container.appendChild(message);
            } else {
                for (var i = 0; i < details.appt_row.length; i++) {
                    var row = document.createElement("div");
                    row.classList += "recordRow";

                    for (var j = 0; j < details.appt_row[i].record.length; j++) {
                        var appt = details.appt_row[i].record[j];

                        var record = document.createElement("div");
                        record.classList += "record";
                        record.classList += " apptRecord";

                        var header = document.createElement("h4");
                        header.textContent = appt.header;

                        var doctor = document.createElement("div");
                        doctor.textContent = appt.doctor;

                        var location = document.createElement("div");
                        location.textContent = appt.location;

                        var reason = document.createElement("div");
                        reason.textContent = appt.reason;

                        var actionRow = document.createElement("div");
                        actionRow.classList += "actionRow";

                        var reschedule = document.createElement("a");
                        reschedule.setAttribute("href", appt.reschedule);
                        reschedule.textContent = "Reschedule";

                        var cancel = document.createElement("a");
                        cancel.classList.add("cancelAppt");
                        cancel.setAttribute("onclick", "confirmCancel(" + appt.appt + ", " + appt.patient + ")");
                        cancel.textContent = "Cancel";

                        actionRow.appendChild(reschedule);
                        actionRow.appendChild(cancel);

                        record.appendChild(header);
                        record.appendChild(doctor);
                        record.appendChild(location);
                        record.appendChild(reason);
                        record.appendChild(actionRow);

                        row.appendChild(record);
                    }

                    container.appendChild(row);
                }
            }

            document.getElementById("appointments").appendChild(container);
            document.getElementById("detail").style.display = "block";
            document.getElementById("appointments").style.display = "block";
        } else {
            console.log("Error in network request: " + req.statusText);
        }
    });

    req.send(null);
}

function confirmCancel(appt, patient) {
    var choice = confirm("Are you sure you want to cancel this appointment?");
    if (choice == true) {
        var req = new XMLHttpRequest();
        var body = { appt: appt, patient: patient };
        req.open('POST', '/cancel', true);
        req.setRequestHeader('Content-Type', 'application/json');
        req.addEventListener('load', function() {
            if (req.status >= 200 && req.status < 400) {
                window.location.href = '/r/patient?id=' + patient + '&cancel=success';
            } else {
                console.log("Error in network request: " + req.statusText);
            }
        });
        req.send(JSON.stringify(body));
    }
}