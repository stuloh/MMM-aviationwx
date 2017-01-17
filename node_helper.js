/* Magic Mirror
 * Module: Aviation Weather
 *
 * By Stuart Loh https://github.com/stuloh
 * Licensed under Apache v2 license
 */

var NodeHelper = require("node_helper");
var request = require("request");

module.exports = NodeHelper.create({
  start: function () {
    console.log("MMM-aviationwx helper started ...");
  },

  getWX: function (payload) {
    console.log("--Aviation WX: Fetching METAR Data--");
    var self = this;

    // [airports, metarUrl, FAAUrl] = payload;
    var airports = payload[0].split(",");
    var metarUrl = payload[1];
    var FAAUrl = payload[2];
    var airportData = new Object();

    // Convert to US ICAO codes
    airports = airports.map(function(airport) {
      airport = airport.trim();
      return (airport.length < 4) ? "K" + airport : airport;
    });
    
    // Track number of HTTP requests to be made
    var numAirports = airports.length;

    request({ url: metarUrl, method: "GET" }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var metarData = JSON.parse(body).features;
        airports.forEach(function(airport) {
          metarData.forEach(function(metar) {
            if (airport === metar.properties.id) {
              console.log("METAR data found for " + airport);
              airportData[airport] = metar.properties;
              return; // check next airport in list
            }
          });
        });
      } else {
        console.log("Error fetching METAR data:" + error +
                    " (HTTP status: " + response.statusCode + ")");
        return;
      }

      // Now check for FAA data
      airports.forEach(function(airport, index) {
        var FAACheckUrl = FAAUrl.replace("<IATA_CODE>", airport.substr(1)); // FAA takes IATA codes

        request({url: FAACheckUrl, method: "GET"}, function (err, rsp, bod) {
          if (!error && rsp.statusCode == 200) {
            console.log("FAA data found for " + airport);
            airportData[airport]["FAA"] = JSON.parse(bod);
          } else {
            if (rsp.statusCode == 404) {
              console.log("FAA data not found for " + airport + " (HTTP status: 404)");
            } else {
              console.log("Error fetching FAA data for " + airport + ": " + error +
                          " (HTTP status: " + rsp.statusCode + ")");
            }
          }
          // This async call has completed, decrement number of HTTP requests remaining
          // There may be a better technique of doing this
          numAirports--;
          if (numAirports == 0) self.sendSocketNotification("WX_RESULT", airportData);
        });
      });
    });
  },

  //Subclass socketNotificationReceived received.
  socketNotificationReceived: function(notification, payload) {
    if (notification === "GET_WX") {
      this.getWX(payload);
    }
  }

});

