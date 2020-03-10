/* https://www.cssscript.com/demo/simple-yearly-calendar-in-pure-javascript-calendarize/ */
var dates;
var currentMonth;
var firstMonth;
var currentYear;
var firstYear;

var calendarize = new Calendarize();
resetCalendar();

document.getElementById("previousMonth").addEventListener("click", buildPreviousMonth);
document.getElementById("nextMonth").addEventListener("click", buildNextMonth);

if (document.getElementById("patientInput").value) {
    getDates(document.getElementById("patientInput").value);
}

if (document.getElementById("patientSelect")) {
    document.getElementById("patientSelect").addEventListener("change", function(event) {
        if (document.getElementById("patientSelect").value == "0") {
            document.getElementById("doctor").style.display = "none";
            document.getElementById("location").style.display = "none";
            document.getElementById("schedule").style.display = "none";
        } else {
            var id = document.getElementById("patientSelect").value;
            document.getElementById("patientInput").value = id;
            getDates(id);
        }
    });
}


function getDates(id) {
    var req = new XMLHttpRequest();
    req.open('GET', '/schedule?ajax=true&patient=' + id, true);
    req.setRequestHeader('Content-Type', 'application/json');
    req.addEventListener('load', function() {
        if (req.status >= 200 && req.status < 400) {
            var result = JSON.parse(req.responseText);

            document.getElementById("doctorID").value = result.did;
            document.getElementById("doctorName").textContent = result.doctor;

            document.getElementById("locationID").value = result.lid;
            document.getElementById("locationLabel").textContent = result.location;

            dates = result.dates;

            if (dates && dates.length > 0) {
                var firstDate = new Date(dates[0].date);
                currentMonth = firstDate.getMonth();
                firstMonth = firstDate.getMonth();
                currentYear = firstDate.getFullYear();
                firstYear = firstDate.getFullYear();
            } else {
                currentMonth = new Date().getMonth();
                firstMonth = new Date().getMonth();
                currentYear = new Date().getFullYear();
                firstYear = new Date().getFullYear();
            }

            buildFirstMonth();
        } else {
            console.log("Error in network request: " + req.statusText);
        }
    });

    req.send(null);
}

function resetCalendar() {
    document.getElementById("available").style.display = "none";
    document.getElementById("defaultText").style.display = "block";
    document.getElementById("noAppts").style.display = "none";
}

function buildFirstMonth() {
    var $calendar = document.getElementById("calendar");
    calendarize.buildCalendar($calendar, currentYear, currentMonth, dates);

    document.getElementById("doctor").style.display = "block";
    document.getElementById("location").style.display = "block";
    document.getElementById("schedule").style.display = "block";
    resetCalendar();
    updateButtons();
}

function buildPreviousMonth(event) {
    var $calendar = document.getElementById("calendar");

    currentMonth -= 1;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear -= 1;
    }

    calendarize.buildCalendar($calendar, currentYear, currentMonth, dates);
    
    updateButtons();
}

function buildNextMonth(event) {
    var $calendar = document.getElementById("calendar");

    currentMonth += 1;
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear += 1;
    }

    calendarize.buildCalendar($calendar, currentYear, currentMonth, dates);
    
    updateButtons();
}

function updateButtons() {
    if (currentYear == firstYear && currentMonth == firstMonth) {
        document.getElementById("previousMonth").disabled = true;
    } else {
        document.getElementById("previousMonth").disabled = false;
    }
}