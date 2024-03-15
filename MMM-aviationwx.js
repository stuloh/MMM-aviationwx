/* 
 * Aviation Weather Module for MagicMirror2 (MMM-aviationwx)
 * - Displays weather from METAR reports and FAA delay information where available
 * - U.S. airports only
 *
 * METAR Code Quick Reference:
 * http://chesapeakesportpilot.com/wp-content/uploads/2015/03/military_wx_codes.pdf
 *
 * Copyright 2017 Stuart Loh (www.hearye.org)
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

Module.register("MMM-aviationwx", {

  // Initialize var for storing data
  wxdata: [],
  airportList:[],
	
  // Default module configuration variables
	defaults: {
		airports: "KSFO,PAO,HAF,JFK", // continental U.S. airports only
    updateInterval: 10, // in minutes
    fadeSpeed: 1000,
    debug: false
	},

  getScripts: function() {
    return ["moment.js"];
  },

  getStyles: function() {
    return ["MMM-aviationwx.css"];
	},

  // Entry point for module
  start: function () { 
    // Format data for each airport
    this.airportList = this.config.airports.split(",");
    this.airportList = this.airportList.map(function (ap) { return ap.trim(); });
    this.getWX();
    this.scheduleUpdate();
  },

	// Override dom generator
	getDom: function() {
    var wrapper = document.createElement("div");
    wrapper.className = "medium";

    // Create table element
    var table = document.createElement("table");
    table.classList.add("xsmall", "table");

    // Create header row
    var headerRow = document.createElement("tr");
    var statusH = document.createElement("th");
    statusH.innerHTML = " ";
    headerRow.appendChild(statusH);
    var airportH = document.createElement("th");
    airportH.innerHTML = "Airport";
    headerRow.appendChild(airportH);
    var wxH = document.createElement("th");
    wxH.className = "left-align";
    wxH.innerHTML = "Weather";
    headerRow.appendChild(wxH);
    table.appendChild(headerRow);

    // Abort if no wx data received
    if (Object.keys(this.wxdata).length < 1) return wrapper;



    var notFound = "";
    for (var i = 0; i < this.airportList.length; i++) {
      var airportKey = (this.airportList[i].length === 3) ? "K" + this.airportList[i] : this.airportList[i];

      if (!(airportKey in this.wxdata)) {
        if (airportKey) notFound += airportKey + " ";
        console.log("Error: " + airportKey + " data not found. " +
                    "Check correct code, or airport has stopped reporting METAR for the day.");
        continue;
      }

      ///
      ///  updates to variable names and values starting here 
      /// see sample_data.txt for format and names
      ///

      // Pull out variables for display
      var airport = this.wxdata[airportKey];
      var icao = airport.id;
      var iata = airport.id.substr(1);
      var name = airport.site;
      var fltcat = airport.fltcat;
      var temp = parseInt(airport.temp);
      var dewpoint = parseInt(airport.dewp);
      var winddir = this.padZeroes(airport.wdir, 3);
      var windspeed = this.padZeroes(airport.wspd, 2);
      var wind = (windspeed > 0) ? winddir + "@" + windspeed + "kt" : "CALM";
      var visibility = airport.visib;
      var wx = airport.wx || "";
      var cover = airport.cover;
      var ceiling = (airport.ceil) ? cover + " " + airport.ceil : cover;
      var obsTime = airport.obsTime; // yyyy-mm-ddThh:mm:ssZ
          obsTime = obsTime.replace("Z", " +0000").replace("T", " ");
      var obsTimeMoment = moment(obsTime, "YYYY-MM-DD HH:mm:ss Z").local();
      var minsSinceObs = moment().diff(obsTimeMoment, "minutes");
      var rawMETAR = airport.rawOb;
      var delay = 0; // 0 = no data, 1 = delay, 2 = no delay

      // Check if FAA delay data for airport exists
      if ("FAA" in airport) {
        if (airport.FAA.delay === "true") {
          // See http://www.fly.faa.gov/Products/Glossary_of_Terms/glossary_of_terms.html
          // for common FAA delay abbreviations
          var delay = 1;
          var delayReason = airport.FAA.status.reason;
          var delayType = airport.FAA.status.type;
          var minDelay = airport.FAA.status.minDelay;
          var delayAvg = airport.FAA.status.avgDelay;
          var maxDelay = airport.FAA.status.maxDelay;
          var delayTime;
          if (minDelay) delayTime = "Min delays of " + minDelay;
          if (delayAvg) delayTime = "Avg delays of " + delayAvg;
          if (maxDelay) delayTime = "Max delays of " + maxDelay;
        } else {
          var delay = 2;
        }
      }

      // Create Table Row
      var row = document.createElement("tr");
      row.classList.add("small", "top-align");

      // Show Flight Category (VFR, MVFR, IFR, LIFR)
      var statusCell = document.createElement("td");
      statusCell.className = "bright";
      var statusSpan = document.createElement("span");
      statusSpan.className = fltcat.toLowerCase();
      statusSpan.setAttribute("title", fltcat);
      statusSpan.innerHTML = "&#9673;"
      statusCell.appendChild(statusSpan);
      row.appendChild(statusCell);

      // Show Airport Name and any delays
      var nameCell = document.createElement("td");
      nameCell.className = "bright nodec left-align";
      var tafUrl = "https://aviationweather.gov/api/data/taf?ids=" + icao + "&format=decoded&metars=on&layout=on";
      nameCell.innerHTML = this.wrapInLink(iata, tafUrl) + "&nbsp;";
      nameCell.setAttribute("title", name + " Airport");
      if (delay === 1) {
        var delaySpan = document.createElement("span");
        var faaUrl = "http://www.fly.faa.gov/flyfaa/usmap.jsp";
        if (delayTime.includes("hour")) {
          delaySpan.className = "major-delay nodec";
          delaySpan.innerHTML = this.wrapInLink("&#9650;", faaUrl);
        } else {
          delaySpan.className = "minor-delay nodec";
          delaySpan.innerHTML = this.wrapInLink("&#9651;", faaUrl);
        }
        delaySpan.innerHTML += "&nbsp; ";
        delaySpan.setAttribute("title", "Maximum delays of " + delayTime);
        nameCell.appendChild(delaySpan);

        this.sendNotification("SHOW_ALERT", {
          type: "notification",
          title: "Alert",
          message: "Airport delays exist at " + icao + " (" + name + " Airport)",
        });
      }
      row.appendChild(nameCell);

      // Show WX
      var wxCell = document.createElement("td");
      wxCell.className = "xsmall bottom-align left-align";
      wxCell.setAttribute("title", rawMETAR);
      wxCell.innerHTML = "<b>" + wind + " " +
                         visibility + "SM " + ceiling + " " +
                         temp + "/" + dewpoint + "</b> " + wx + "&nbsp; " +
                         obsTimeMoment.format("[(]HH:mm[)]");
      if (delay === 1) {
        wxCell.innerHTML += "<br>Delays due to " + delayReason + " (" + delayType + ")"; 
        wxCell.innerHTML += "<br>" + delayTime;
      }
      row.appendChild(wxCell);

      // Append row
      table.appendChild(row);
    }

    // Identify any airports for which data was not retrieved
    if (notFound) {
      var errorRow = document.createElement("tr");
      errorRow.className = "xsmall dimmer";
      var errorCell = document.createElement("td");
      errorCell.setAttribute("colSpan", "3");
      errorCell.innerHTML = "<i>No data for " + notFound + " (may not be reporting)</i>";
      errorRow.appendChild(errorCell);
      table.appendChild(errorRow);
      notFound = "";
    }

    wrapper.appendChild(table);
    return wrapper;
	},

  scheduleUpdate: function(delay) {
		var nextLoad = this.config.updateInterval * 60000;
		if (typeof delay !== "undefined" && delay >= 0) {
			nextLoad = delay;
		}

		var self = this;
		setInterval(function() {
			self.getWX();
		}, nextLoad);
	},

  // Helper Functions
  padZeroes: function(num, size) {
    var s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
  },

  wrapInLink: function(text, url) {
    return "<a href=\"" + url + "\" target=\"_blank\">" + text + "</a>";
  },

  // Data Handling Functions
  getWX: function () {
    //var metarUrl = "https://aviationweather.gov/gis/scripts/MetarJSON.php?density=all"; 
    var metarUrl = "https://aviationweather.gov/api/data/metar?format=json&taf=true&hours=1&ids=" 
    var FAAUrl = "https://nasstatus.faa.gov/api/airport-status-information"
    var payload = { airportList: this.config.airports, metraUrl: metarUrl, faaUrl: FAAUrl, debug: this.config.debug };
    
    this.sendSocketNotification("GET_WX", payload);
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification === "WX_RESULT") {
      this.wxdata = payload;
      this.updateDom(this.config.fadeSpeed);
    }    
  },
});
