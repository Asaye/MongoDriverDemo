const CODE_DOUBLE     = 1;
const CODE_STRING     = 2;
const CODE_EMBEDDED   = 3;
const CODE_ARRAY      = 4;
const CODE_BINARY     = 5;
const CODE_OID        = 7;
const CODE_BOOLEAN    = 8;
const CODE_DATE       = 9;
const CODE_NULL       = 10;
const CODE_REGEX      = 11;
const CODE_JS         = 13;
const CODE_JS_WS      = 15;
const CODE_INTEGER    = 16;
const CODE_TIME       = 17;
const CODE_BIGINT     = 18;
const CODE_DECIMAL    = 19;

module.exports = class {

	constructor() {
		this.document = Buffer.alloc(1024);
		this.buffers = [];
		this.offset = 0;
	}

	serialize(data) {		
		this.offset = 0;
		if (this.document.length > 1024) {
			this.document = this.document.subarray(0, 1024);
		}
		this._encodeObject(data);	

		return this.document.slice(0, this.offset);
	}

	deserialize(data) {
		return this._decodeObject(data);
	}

	_encodeObject(data) {
		if (!data || typeof data !== 'object') return;

		var keys = [], start = this.offset;
		if (typeof data === 'object' && Array.isArray(data)) {
			var object_equiv = {};			
			data.forEach((item, index) => {
				keys.push(index);
				object_equiv[index] = item;
			});
		} else {
			keys = Object.keys(data);
		}		

		try {				
			if (keys.length === 0) {			
				this.document.writeInt32LE(5, this.offset);
				this.document[this.offset + 4] = 0;			
				this.offset += 5;
				return this.document.slice(this.offset - 5, this.offset);
			}

			var buf_key, val, code, code_index;	
			
			this.offset += 4; // reserve 4 spaces for length

			keys.forEach((key) => {
				val = data[key];				
				code_index = this.offset++;
				this.document.write(key + "\0", this.offset, key.length + 1);
				this.offset += (key.length + 1);

				if (val === false) {
					code = CODE_BOOLEAN;
					this.document[this.offset++] = 0x00;
				} else if (val === true) {
					code = CODE_BOOLEAN;				
					this.document[this.offset++] = 0x01;
				} else if (val === null || val === undefined) {
					code = CODE_NULL;
				} else if (typeof val === 'string') {
					code = CODE_STRING;					
					this.document.writeInt32LE(val.length + 1, this.offset);
					this.offset += 4;
					this.document.write(val + "\0", this.offset, val.length + 1);
					this.offset += (val.length + 1);
				} else if (typeof val === 'number' && parseInt(val) === val) {
					code = CODE_INTEGER;
					this.document.writeInt32LE(val, this.offset);
					this.offset += 4;
				} else if (typeof val === 'number') {
					code = CODE_DOUBLE;
					this.document.writeDoubleLE(val, this.offset);
					this.offset += 8;
				} else if (typeof val === 'object' && Array.isArray(val)) {
					code = CODE_ARRAY;					
					this._encodeObject(val);
				} else if (typeof val === 'object') {
					code = CODE_EMBEDDED;
					this._encodeObject(val);
				} 
				this.document[code_index] = code;
			});
			
			this.document[this.offset++] = 0;
			this.document.writeInt32LE(this.offset - start, start);	
		} catch(e) {
			if (e.code === "ERR_BUFFER_OUT_OF_BOUNDS") {
				this.offset = this.prevEnd;
				this.document = Buffer.concat([this.document, Buffer.alloc(1024)]);
				this._encodeObject(data)
			}
		}
	}

	_decodeObject(document) {
		
		var offset = 0, code, e_name, end, len, decoded = {};
		const length = document.readInt32LE(offset);
		offset += 4;
		
		while(offset < document.length - 4) {
			code = document[offset++];
			end = document.indexOf(0, offset);
			e_name = document.toString("utf-8", offset, end);
			offset = end + 1;
			
			if (code === 0x01) {
				decoded[e_name] = document.readDoubleLE(offset);
				offset += 8;
			} else if (code === 0x02) {
				len = document.readInt32LE(offset);
				offset += 4;
				decoded[e_name] = document.toString("utf-8", offset, offset + len - 1);
				offset += len;	
			} else if (code === 0x03) {
				len = document.readInt32LE(offset);	
				decoded[e_name] = this._decodeObject(document.slice(offset, offset + len));
				offset += len;
			} else if (code === 0x04) { 
				len = document.readInt32LE(offset);	
				var temp = this._decodeObject(document.slice(offset, offset + len));
				var array = [];
				Object.values(temp).forEach((val) => {
				 	array.push(val);
				});
				decoded[e_name] = array;
				offset += len;
			} else if (code === 0x05) { 		
				len = document.readInt32LE(offset);
				offset += 4;
				var subtype = document[offset++];		
				decoded[e_name] = document.toString("utf-8",  offset, offset + len);
				offset += len;
			} else if (code === 0x07) { 						
				decoded[e_name] = document.slice(offset, offset + 12).toString('hex');
				offset += 12;
			} else if (code === 0x08) {
				if (document[offset] === 0x00) {
					decoded[e_name] = false;
				} else if (document[offset] === 0x01) {
					decoded[e_name] = true;
				}
				offset++;
			} else if (code === 0x09) {
				decoded[e_name] = document.readDoubleLE(offset);
				offset += 8;
			} else if (code === 0x0A) {
				 decoded[e_name] = null;
			} else if (code === 0x0B) {
				end = document.indexOf(0, offset);				
				var regex = document.toString("utf-8", offset, end);
				offset = end + 1;
				end = document.indexOf(0, offset);
				var options = document.toString("utf-8", offset, end);
				offset = end + 1;
				decoded[e_name] = {
					regex: regex,
					regex_options: options
				};
			} else if (code === 0x0D) {
				len = document.readInt32LE(offset);
				offset += 4;
				decoded[e_name] = document.toString("utf-8", offset, offset + len);
				offset += len;
			} else if (code === 0x0F) {
				len = document.readInt32LE(offset);				
				var len2 = document.readInt32LE(offset + 4);
				var key = document.toString("utf-8", offset + 8, offset + 8 + len2);				
				var jsCode = this._decodeObject(document.slice(offset + 8 + len2, offset + len));
				var temp = {};
				temp[key] = jsCode;
				decoded[e_name] = temp;
				offset += len;	
			} else if (code === 0x10) {
				decoded[e_name] = document.readInt32LE(offset);
				offset += 4;
			} else if (code === 0x11) {
				decoded[e_name] = document.readDoubleLE(offset);
				offset += 8;
			} else if (code === 0x12) {
				decoded[e_name] = document.readDoubleLE(offset);
				offset += 8;
			} else if (code === 0x13) {
				decoded[e_name] = document.toString("utf-8", offset, offset + 16);
				offset += 16;
			} 
		}
		return decoded;
	}
};