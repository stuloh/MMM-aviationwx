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
    var US_country=payload[1].split(",");
    var metarUrl = payload[2];
    var FAAUrl = payload[3];
    var airportData = new Object();
    var airportICAO = new Object();
    var iata_to_icao_url="https://ae.roplan.es/api/IATA-ICAO.php?iata="; //url api to get ICAO with IATA
    var icao_to_iata_url="https://ae.roplan.es/api/ICAO-IATA.php?icao="; //url api to get IATA with ICAO

    // Convert codes
    airports.forEach(function(airport, index) {
    	
      airportData[airport]= new Object();
      
      if (airport.length < 4){ //IATA code
        if (US_country[index]==="Y"){
        	
          airportICAO[airport]="K" + airport;
          
        }else{
        	
          var ICAOCheckUrl = iata_to_icao_url + airport;
        	
          request({url: ICAOCheckUrl, method: "GET"}, function (err, rsp, bod) {
            if (!err && rsp.statusCode == 200) {
              console.log("ICAO found for " + airport);
                airportICAO[airport] = bod;
            } else {
              if (rsp.statusCode == 404) {
                console.log("ICAO not found for " + airport + " (HTTP status: 404)");
              } else {
                console.log("Error fetching ICAO for " + airport + ": " + error +
                            " (HTTP status: " + rsp.statusCode + ")");
              }
            }
          });
        }
        airportData[airport]["IATA"] =airport;
        
      }else{ //ICAO code
      
        if (US_country[index]==="Y"){
          airportData[airport]["IATA"] = airport.substr(1);
        }else{
          var IATACheckUrl = icao_to_iata_url + airport;
        	
          request({url: IATACheckUrl, method: "GET"}, function (err, rsp, bod) {
            if (!err && rsp.statusCode == 200) {
              console.log("No error IATA search for " + airport);
                airportData[airport]["IATA"] = bod;
            } else {
              if (rsp.statusCode == 404) {
                console.log("IATA not found for " + airport + " (HTTP status: 404)");
              } else {
                console.log("Error fetching IATA for " + airport + ": " + error +
                            " (HTTP status: " + rsp.statusCode + ")");
              }
            }
          });
        }
        airportICAO[airport] =airport;
      }
    });  
    // Track number of HTTP requests to be made
    var numAirports = airports.length;

    request({ url: metarUrl, method: "GET" }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        var metarData = JSON.parse(body).features;
        airports.forEach(function(airport) {
          metarData.forEach(function(metar) {
            if (airportICAO[airport] === metar.properties.id) {
              console.log("METAR data found for " + airport);
              airportData[airport]["METAR"] = metar.properties;
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
      	if (US_country[index]==="Y"){
          var FAACheckUrl = FAAUrl.replace("<IATA_CODE>", airportICAO[airport].substr(1)); // FAA takes IATA codes

          request({url: FAACheckUrl, method: "GET"}, function (err, rsp, bod) {
            if (!err && rsp.statusCode == 200) {
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
          });
      	}
        numAirports--;
        if (numAirports == 0) self.sendSocketNotification("WX_RESULT", airportData);
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
