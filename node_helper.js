/* Magic Mirror
 * Module: Aviation Weather
 *
 * By Stuart Loh https://github.com/stuloh
 * Licensed under Apache v2 license
 */

const NodeHelper = require("node_helper");
const request = require("request");
const convert = require('xml2json')
const concat = require('concat-stream');

const test_data= '<AIRPORT_STATUS_INFORMATION><Update_Time>Tue Mar 12 16: 29: 59 2024 GMT</Update_Time><Dtd_File>http://www.fly.faa.gov/AirportStatus.dtd</Dtd_File><Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List><Ground_Delay><ARPT>SFO</ARPT><Reason>runway construction</Reason><Avg>25 minutes</Avg><Max>1 hour and 26 minutes</Max></Ground_Delay><Ground_Delay><ARPT>LAS</ARPT><Reason>wind</Reason><Avg>56 minutes</Avg><Max>2 hours and 7 minutes</Max></Ground_Delay></Ground_Delay_List></Delay_type><Delay_type><Name>General Arrival/Departure Delay Info</Name><Arrival_Departure_Delay_List><Delay><ARPT>PHX</ARPT><Reason>VOL:Multi-taxi</Reason><Arrival_Departure Type="Departure"><Min>16 minutes</Min><Max>30 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay><Delay><ARPT>SFO</ARPT><Reason>WX:Wind</Reason><Arrival_Departure Type="Departure"><Min>16 minutes</Min><Max>30 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay></Arrival_Departure_Delay_List></Delay_type><Delay_type><Name>Airport Closures</Name><Airport_Closure_List><Airport><ARPT>LAS</ARPT><Reason>!LAS 12/067 LAS AD AP CLSD TO NON SKED TRANSIENT GA ACFT EXC PPR 702-261-7775 2312132300-2403132300</Reason><Start>Dec 13 at 18:00 UTC.</Start><Reopen>Mar 13 at 19:00 UTC.</Reopen></Airport></Airport_Closure_List></Delay_type></AIRPORT_STATUS_INFORMATION>'
const checktype = { "Airspace_Flow_List": "Airspace_Flow", "Ground_Delay_List": "Ground_Delay", "Arrival_Departure_Delay_List": "Delay", "Airport_Closure_List": "Airport", "Ground_Stop_List":"Program" }

module.exports = NodeHelper.create({
  start: function () {
    console.log("MMM-aviationwx helper started ...");
  },
  debug: false,

  getWX: async function (payload) {
    console.log("--Aviation WX: Fetching METAR Data--");
    var self = this;

    var metarUrl = payload.metraUrl;
    var FAAUrl = payload.faaUrl;
    var airportData = new Object();

    // Convert to US ICAO codes
    var airports = payload.airportList.split(",").map(function (airport) {
      airport = airport.trim();
      return (airport.length < 4) ? "K" + airport : airport;
    });
    
    try {

      if (this.debug) {
        console.log("about to fetch url=" + metarUrl + airports.join('%2c'))
      }
      let response = await fetch(metarUrl + airports.join('%2c'))

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      if (this.debug)
        console.group("fetch ok")

      // Read response body as buffer
      var metarData = await response.json();
      if (this.debug)
        console.log("json_string="+metarData)
        if (this.debug) {
          console.log("json=" + JSON.stringify(metarData, null, 2))
        }
        airports.forEach(function (airport) {
          metarData.forEach(function (metar) {
            if (airport === metar.icaoId) {
              if (this.debug)
                console.log("METAR data found for " + airport);
              airportData[airport] = metar;
              return; // check next airport in list
            }
          });
        });
      
      // Now check for FAA data
      response = await fetch(FAAUrl, {
        headers: {
          'Accept-Encoding': 'text/xml', // Request gzip compression
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      // Read response body as buffer
      let xml_string = await response.text()
      let json_string = convert.toJson(xml_string)

      if (this.debug)
        console.log("json faa=" + json_string)

      const faa_data = JSON.parse(json_string)
      // faa data has an arrray of delay types, 
      // ground stop
      // ground delay
      // airport delay
      // airport closure
      // if the list isnt an array , make it one
      if (!Array.isArray(faa_data['AIRPORT_STATUS_INFORMATION'].Delay_type)) {
        // save the current entry
        const x = faa_data['AIRPORT_STATUS_INFORMATION'].Delay_type
        //  init as an array
        faa_data['AIRPORT_STATUS_INFORMATION'].Delay_type = []
        // add the element into the array
        faa_data['AIRPORT_STATUS_INFORMATION'].Delay_type.push(x)
      }
      // loop thru the delay types
      faa_data['AIRPORT_STATUS_INFORMATION'].Delay_type.forEach(t => {
        // 
        if (t.name !== "Airspace Flow Programs") {
          // for each the  there are two major keys, name and the list for that type
          // get the key of the list
          const keyname = Object.keys(t)[1]
          if (this.debug)
            console.log("keys = "+Object.keys(t))
          // remove the "_list"  part for passing to front end
          const key = keyname.split('_').slice(0, -1).join('_')
          if (this.debug)
            console.log("key data=" + JSON.stringify(t[keyname][checktype[keyname]]) + "keyname=" + keyname + " key=" + checktype[keyname] + "\n")
          if (!Array.isArray(t[keyname][checktype[keyname]])) {
            const x = t[keyname][checktype[keyname]]
            t[keyname][checktype[keyname]] = []
            t[keyname][checktype[keyname]].push(x)
          } else {
            console.log("checkytype=" + checktype[keyname])
          }
          if (this.debug)
            console.log("data=" + Object.keys(faa_data['AIRPORT_STATUS_INFORMATION'].Delay_type)[0] + " data=" + JSON.stringify(t) + " keyname=" + keyname + " key=" + key + " last part=" + JSON.stringify(t[keyname][key]) + "\n")
    
          // look thru all the aaffected airports for this record type
          t[keyname][checktype[keyname]].forEach(airport_record => {
            // if the airport is one the user requested
            if (airports.includes('K' + airport_record.ARPT)) {
              if (airportData['K' + airport_record.ARPT]['FAA'] == undefined)
                airportData['K' + airport_record.ARPT]['FAA'] = {}
              // save this data record
              airportData['K' + airport_record.ARPT]['FAA'][key] = airport_record
            }
          })
        }      
      });
      if (this.debug)
        console.log("sending airport data=" + JSON.stringify(airportData))

      self.sendSocketNotification("WX_RESULT", airportData)
    }
    catch (error) {
      console.log(" fetch error ="+JSON.stringify(error))
    }
},
  //Subclass socketNotificationReceived received.
socketNotificationReceived: async function(notification, payload) {
    if (notification === "GET_WX") {
      this.debug = payload.debug
      this.getWX(payload);
    }
  },
});

