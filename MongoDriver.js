const net = require('net');      // a module required to create a socket
const bson = require('./BSON'); 
const BSON = new bson(); 
//const TYPES = require('./types.json');

module.exports = class MongoDriver {
   constructor() {
      this.socket = null;            // the socket instance
      this.config = null;            // client's configuration data
      this.callback = null;          // the active callback function
      this.requestId = 1;            // request id
      this.queryQueue = [];          // queue of client queries 
      this.isReadyForQuery = false;  // is the database is ready to 
                                     // process the next query? 
   }

   connect(config, callback) { 
      this.config = config;
      this.callback = callback;
      this.shouldAuthenticate = config.password != undefined;
      this.socket = new net.Socket();   
      this._addListeners();
      this.socket.connect(config.port, config.host); 
   }

   query(command, callback) { 
      // if the database server is ready for query and the queue is
      // empty, send the query directly. Otherwise, add the serialized text and
      // callback to the queryQueue
      if (this.isReadyForQuery && this.queryQueue.length === 0) {
         // set the 'isReadyForQuery' flag to false so that another 
         // query won't interrupt this one
         this.isReadyForQuery = false; 
         this.callback = callback;
         this._send(BSON.serialize(command));
      } else {
         this.queryQueue.push({
            "document": BSON.serialize(command), 
            "callback": callback 
         });
      }
   }

   close() {
      this.socket.end();
   }

   _addListeners() {
      this.socket.on("connect", (err) => { 
         this.callback(err, "Connection successful!");
         if (this.shouldAuthenticate) {
             this._authenticate(data);
             this.shouldAuthenticate = false;      //assumes authentication success
         } else {
             this.socket.emit("readyForQuery");
         }
      });   

      this.socket.on("data", (data) => { 
         this._parse(data);
      });

      this.socket.on("error", (err) => {
         this.callback(err);
      });

      this.socket.on("readyForQuery", () => { 
         if (this.queryQueue.length > 0) {         
            this.isReadyForQuery = false;
            const next = this.queryQueue.shift(); 
            this.callback = next.callback;
            this._send(next.document);
         } else {
            this.isReadyForQuery = true;
         }
      });
   }

   _authenticate(data) { 

   }

   _send(document) {
      this.requestId++; 
      const len = 16 + 4 + 1 + document.length;      // 16 (header) + 4 (flagBits) + 1 (0 for section kind with single BSON) + BSON
      const buffer = Buffer.alloc(len); 
      buffer.writeInt32LE(len);                      // total length
      buffer.writeInt32LE(this.requestId, 4);        // request id
      buffer.writeInt32LE(0, 8);                     // response to (only used in server responses)
      buffer.writeInt32LE(2013, 12);                 // opCode for OP_MSG
      buffer[18] = 1;                                // flagBit for exhaustAllowed (19th bit = 1)
      buffer[20] = 0;                                // section kind with single BSON
      document.copy(buffer, 21);                     // write the query BSON starting from index 21
      this.socket.write(buffer);                     // send the OP_MSG to the database
   }

   _parse(document) {
      const length = document.readInt32LE(); 
      const responseTo = document.readInt32LE(8);        // responseTo starts from index = 8
      if (responseTo === this.requestId) {
            const flagBits = document.readInt32LE(16);  // flagBits start from index = 16
            const temp = BSON.deserialize(document.slice(21));  // assuming the section kind is 0
            if (temp.errmsg) {
               this.callback(temp);
            } else {
               this.result = { ...this.result, ...temp };

               if (flagBits | 2 !== flagBits) {          // 2 = flagBit for moreToCome
                  this.callback(null, this.result);
                  this.result = {};
                  this.socket.emit("readyForQuery");
               }
            }            
      } else {
         throw new Error("request-response mismatch");
      }   
   }  
}