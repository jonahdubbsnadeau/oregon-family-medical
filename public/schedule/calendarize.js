/* Author: Jim Camut */
/* Modified By: Jonah Dubbs-Nadeau */
/* https://www.cssscript.com/demo/simple-yearly-calendar-in-pure-javascript-calendarize/ */

function Calendarize() {
	var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	var dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

	return {

		// Return the days in a month - given a year and the month number
		getDaysInMonth: function(month, year) {
			var date = new Date(year, month, 1);
			var days = [];
			while (date.getMonth() === month) {
				days.push(new Date(date));
				date.setDate(date.getDate() + 1);
			}
			return days;
		},

		// return an array of the first day of each month for a given year
		getMonthsInYear: function(year) {
			var date = new Date(year, 0, 1);
			var months = [];
			var monthCount = 0;
			while (monthCount < 12) {
				months.push(new Date(date));
				date.setMonth(date.getMonth() + 1);
				monthCount++;
			}
			return months;
		},

		// Create a full 12-month calendar
		/* buildYearCalendar: function(el, year) {
			var _this = this;
			var months = _this.getMonthsInYear(year);

			var opts = {
				showMonth: true,
				showDaysOfWeek: true,
				showYear: true,
				clickHandler: function(e) {
					var day = e.target.getAttribute("data-date");
					document.getElementById("chooseAvailable").textContent = day;
				}
			};

			months.forEach(function(a, b) {
				var $monthNode = _this.buildMonth(b, year, opts);
				if (b == 0) console.log($monthNode);
				el.appendChild($monthNode);
			});
		}, */

		buildCalendar: function(calendar, year, month, dates) {
			var _this = this;

			var opts = {
				showMonth: true,
				showDaysOfWeek: true,
				showYear: true,
				clickHandler: function(event) {
					// Un-select previously selected date
					var selectedPreviously = document.getElementsByClassName("selectedDate");
					for (var i = 0; i < selectedPreviously.length; i++) {
						selectedPreviously[i].classList.toggle("selectedDate");
					}

					// Highlight currently selected date
					event.target.classList.toggle("selectedDate");
					var day = event.target.getAttribute("data-date");
					
					// Show right pane
					document.getElementById("defaultText").style.display = "none";
					document.getElementById("available").style.display = "block";
					document.getElementById("dateDisplay").textContent = day.substring(0, 16);

					// Clear form
					document.getElementById("appts").textContent = "";

					if (!event.target.classList.contains("availableDay")) {
						document.getElementById("noAppts").style.display = "block";
						document.getElementById("apptForm").style.display = "none";
					} else {
						document.getElementById("noAppts").style.display = "none";

						var did = document.getElementById("doctorID").value;
						var lid = document.getElementById("locationID").value;
						var dateSelected = new Date(day);
						var y = dateSelected.getFullYear();
						var m = dateSelected.getMonth() + 1;
						var d = dateSelected.getDate();

						var url = '/schedule?ajax=true&doctor=' + did;
						url += '&location=' + lid;
						url += '&year=' + y + '&month=' + m + '&day=' + d;

						console.log(url);

						var req = new XMLHttpRequest();
						req.open('GET', url, true);
						req.setRequestHeader('Content-Type', 'application/json');
						req.addEventListener('load', function() {
							if (req.status >= 200 && req.status < 400) {
								var appointments = JSON.parse(req.responseText);
								var nodes = [];

								for (var i = 0; i < appointments.length; i++) {
									var container = document.createElement("div");
									container.classList.add("appointmentTime");

									var formInput = document.createElement("input");
									formInput.setAttribute("type", "radio");
									formInput.setAttribute("name", "appt");
									formInput.setAttribute("value", appointments[i].id);
									container.appendChild(formInput);

									var text = document.createElement("span");
									text.textContent = convert_time(appointments[i].time);
									container.appendChild(text);

									nodes.push(container);
								}

								for (var i = nodes.length - 1; i >= 0; i--) {
									document.getElementById("appts").prepend(nodes[i]);
								}

								document.getElementById("apptForm").style.display = "block";
							} else {
								console.log("Error in network request: " + req.statusText);
							}
						});

						req.send(null);
					}

				}
			};

			var $monthNode = _this.buildMonth(month, year, opts, dates);
			calendar.appendChild($monthNode);
			calendar.removeChild(calendar.firstElementChild);
		},

		// Add days and place fillers for a given month
		buildMonth: function(monthNum, year, opts, dates) {
			//if (monthNum === undefined || year === undefined) return "something is missing";
			var _this = this;
			var dtm = new Date(year, monthNum, 1);
			var dtmMonth = dtm.getMonth();
			var prevM = new Date(dtm.setMonth(dtmMonth - 1));
			var nextM = new Date(dtm.setMonth(dtmMonth + 1));
			var daysInMonth = _this.getDaysInMonth(monthNum, year);
			var daysPrevMonth = _this.getDaysInMonth(prevM.getMonth(), prevM.getFullYear());
			var daysNextMonth = _this.getDaysInMonth(nextM.getMonth(), nextM.getFullYear());
			var $monthNode = document.createElement('div');

			var skipLength = daysInMonth[0].getDay();
			var preLength = daysInMonth.length + skipLength;
			var postLength = function() {
				if (preLength % 7 === 0) {
					return 0;
				} else {
					if (preLength < 35) {
						return 35 - preLength;
					} else {
						return 42 - preLength;
					}
				}
			}

			$monthNode.classList.add('month');

			// Add a Title to the month
			if (opts.showMonth) {
				document.getElementById("monthTitle").textContent = monthNames[monthNum] + (opts.showYear ? " " + year : '');
				/* $titleText.innerText = monthNames[monthNum] + (opts.showYear ? " " + year : '');
				$monthNode.appendChild($titleNode); */
			}


			// Add Days of week to the top row
			if (opts.showDaysOfWeek) {
				dayNames.forEach(function(a, b) {
					var $dayNode = document.createElement('div');
					$dayNode.classList.add('dow');
					$dayNode.innerHTML = dayNames[b];
					$monthNode.appendChild($dayNode);
				});
			}


			// Add blank days to fill in before first day
			for (var i = 0; i < skipLength; i++) {
				var $dayNode = document.createElement('div');
				$dayNode.classList.add('dummy-day');
				$dayNode.innerText = daysPrevMonth.length - (skipLength - (i + 1));
				$monthNode.appendChild($dayNode);
			}


			// Place a day for each day of the month
			daysInMonth.forEach(function(c, d) {
				var $dayNode = document.createElement('div');
				$dayNode.classList.add('day');

				if (dates) {
					for (var i = 0; i < dates.length; i++) {
						if (areEqual(c, new Date(dates[i].date))) {
							$dayNode.classList.add('availableDay');
							break;
						}
					}
				}

				$dayNode.setAttribute("data-date", c);
				$dayNode.innerHTML = (d + 1);
				var dow = new Date(c).getDay();
				if (dow === 0 || dow === 6) $dayNode.classList.add('weekend');
				if (opts.clickHandler) {
					$dayNode.addEventListener("click", opts.clickHandler);
				}
				$monthNode.appendChild($dayNode);
			});

			// Add in the dummy filler days to make an even block
			for (var j = 0; j < postLength(); j++) {
				var $dayNode = document.createElement('div');
				$dayNode.classList.add('dummy-day');
				$dayNode.innerText = j + 1;
				$monthNode.appendChild($dayNode);
			}

			return $monthNode;

		}
	}
}

function areEqual(date1, date2) {
	return (date1.getFullYear() == date2.getFullYear() && date1.getMonth() == date2.getMonth() && date1.getDate() == date2.getDate());
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