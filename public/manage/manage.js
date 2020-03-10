var collapsible = document.getElementsByClassName("collapsible");

for (var i = 0; i < collapsible.length; i++) {
    collapsible[i].addEventListener("click", function() {
        var rightArrow = this.children[1];
        var downArrow = this.children[2];
        var content = this.nextElementSibling;

        if (rightArrow.style.display === "none") {
            rightArrow.style.display = "inline-block";
        } else {
            rightArrow.style.display = "none";
        }

        if (downArrow.style.display === "inline-block") {
            downArrow.style.display = "none";
        } else {
            downArrow.style.display = "inline-block";
        }

        if (content.style.display === "block") {
            content.style.display = "none";
        } else {
            content.style.display = "block";
        }
    });
}