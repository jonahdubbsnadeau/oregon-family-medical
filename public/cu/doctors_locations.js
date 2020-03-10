var chosenFirst;

document.getElementById("doc").addEventListener("change", function(event) {
    if (!chosenFirst) {
        chosenFirst = "doc";
    }
    
    if (chosenFirst == "doc") {
        var doctorID = document.getElementById("doc").value;
        if (doctorID == 0) {
            doctorID = "all";

            if (document.getElementById("loc").value == 0) {
                chosenFirst = null;
            }
        }

        var req = new XMLHttpRequest();
        req.open('GET', '/doctors_locations?doc=' + doctorID, false);
        req.setRequestHeader('Content-Type', 'application/json');
        req.addEventListener('load', function() {
            if (req.status >= 200 && req.status < 400) {
                var locationSelect = document.getElementById("loc");
                locationSelect.textContent = "";
                var blankOption = document.createElement("option");
                blankOption.setAttribute("value", "0");
                locationSelect.appendChild(blankOption);

                var options = JSON.parse(req.responseText);

                for (var i = 0; i < options.length; i++) {
                    var option = document.createElement("option");
                    option.setAttribute("value", options[i].option_value);
                    option.textContent = options[i].option_text;
                    locationSelect.appendChild(option);
                }
            } else {
                console.log("Error in network request: " + req.statusText);
            }
        });
        req.send(null);
    }
});

document.getElementById("loc").addEventListener("change", function(event) {
    if (!chosenFirst) {
        chosenFirst = "loc";
    }

    if (chosenFirst == "loc") {
        var locationID = document.getElementById("loc").value;
        if (locationID == 0) {
            locationID = "all";

            if (document.getElementById("doc").value == 0) {
                chosenFirst = null;
            }
        }

        var req = new XMLHttpRequest();
        req.open('GET', '/doctors_locations?loc=' + locationID, false);
        req.setRequestHeader('Content-Type', 'application/json');
        req.addEventListener('load', function() {
            if (req.status >= 200 && req.status < 400) {
                var doctorSelect = document.getElementById("doc");
                doctorSelect.textContent = "";
                var blankOption = document.createElement("option");
                blankOption.setAttribute("value", "0");
                doctorSelect.appendChild(blankOption);

                var options = JSON.parse(req.responseText);

                for (var i = 0; i < options.length; i++) {
                    var option = document.createElement("option");
                    option.setAttribute("value", options[i].option_value);
                    option.textContent = options[i].option_text;
                    doctorSelect.appendChild(option);
                }
            } else {
                console.log("Error in network request: " + req.statusText);
            }
        });
        req.send(null);
    }
});