var checkbox = document.getElementsByClassName("checkbox");

for (var i = 0; i < checkbox.length; i++) {
    checkbox[i].addEventListener("change", function(event) {
        clearError();
    });
}

document.getElementById("submitButton").addEventListener("click", function(event) {
    var checkbox = document.getElementsByClassName("checkbox");
    var i = 0;
    var anyChecked = false;

    while (i < checkbox.length && !anyChecked) {
        if (checkbox[i].checked == true) {
            anyChecked = true;
        }
        i++;
    }

    if (!anyChecked) {
        event.preventDefault();
        displayError("Please choose at least one location.");
    }
});

function displayError(error) {
    document.getElementById("errorMessage").textContent = error;
}

function clearError() {
    document.getElementById("errorMessage").textContent = "";
}