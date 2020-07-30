// MyDriverDemo/App.js
const MongoDriver = require('./MongoDriver');
const db = new MongoDriver();

const config = {
   "host": "localhost", 
   "port": 27017
};

db.connect(config, (err, res) => {
   if (err) {
      console.log(err);
      return;
   }
   console.log(res);    // connected
});

db.query({ find: "africa", $db: "continents" }, (err, res) => {
   if (err) {
      console.log(err);
      return;
   }
   console.log("Result set in JSON format is:");
   console.log(res.cursor);
   db.close();
});