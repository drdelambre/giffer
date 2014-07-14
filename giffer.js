//
// Giffer.js
//
// This bad boy loads a gif, cuts it apart, and maintains the
// render loop. Yet it does no drawing! This is so you can drop
// in whatever dom library you have at your disposal. Draw with
// something like this:
//		var myelement = $dd.dom('#dance'),
//			fb = document.createElement('canvas'),
//			gif = giffer();
//
//		gif.on_frame(function(_gif){
//			fb.width = gif.width;
//			fb.height = gif.height;
//			fb.getContext('2d').putImageData(_gif,0,0);
//
//			myelement.css({ 'background-image': fb.toDataURL() });
//		});
//
//		gif.load('http://i.imgur.com/98BbqFr.gif');
//
// The heavy lifting has been done, so go make an amazing gif
// interface that blows the pants off the internet!

var Giffer = (function(){
	// Thanks for the requestAnimationFrame polyfill Erik Möller!
	(function() {
		var lastTime = 0,
			vendors = ['webkit', 'moz'],
			x;
		for(x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
			window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
			window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
		}

		if(!window.requestAnimationFrame){
			window.requestAnimationFrame = function(callback, element) {
				var currTime = new Date().getTime(),
					timeToCall = Math.max(0, 16 - (currTime - lastTime)),
					id = window.setTimeout(function(){ callback(currTime + timeToCall); },timeToCall);
				lastTime = currTime + timeToCall;
				return id;
			};
		}

		if(!window.cancelAnimationFrame){
			window.cancelAnimationFrame = function(id) {
				clearTimeout(id);
			};
		}
	}());

	// Most of the important parts of this logic were
	// ripped from the hard work at:
	// 		https://github.com/shachaf/jsgif
	// I just cleaned it up a bit, sped it up a lot, and
	// wrapped the interface to be easier to play with

	function squish(){
		var args = Array.prototype.slice.call(arguments,0),
			out = {},
			ni, na;
		for(ni = args.length -1; ni >= 0; ni--){
			for(na in args[ni]){
				out[na] = args[ni][na];
			}
		}
		return out;
	}
	function bitsToNum(ba){
		return ba.reduce(function(s, n){ return s * 2 + n; }, 0);
	}
	function byteToBitArr(bite) {
		var a = [], i;
		for(i = 7; i >= 0; i--){
			a.push(!!(bite & (1 << i)));
		}
		return a;
	}
	function streamer(data){
		var self = {
			data: data,
			len: data.length,
			pos: 0
		};

		self.readByte = function() {
			if(self.pos >= self.len){
				throw new Error('Attempted to read past end of stream');
			}
			return self.data.charCodeAt(self.pos++) & 0xFF;
		};

		self.readBytes = function(n){
			var bytes = [], i;
			for(i = 0; i < n; i++){
				bytes.push(self.readByte());
			}
			return bytes;
		};

		self.read = function(n){
			var s = '', i;
			for(i = 0; i < n; i++){
				s += String.fromCharCode(self.readByte());
			}
			return s;
		};

		self.readUnsigned = function(){ // Little-endian.
			var a = self.readBytes(2);
			return (a[1] << 8) + a[0];
		};

		return self;
	}
	function lzwDecode(minCodeSize, data){
		var clearCode = 1 << minCodeSize,
			eoiCode = clearCode + 1,
			codeSize = minCodeSize + 1,

			dict = '',
			output = [],
			outer = '',
			pos = 0,

			last, code, i, rez;

		while(true){
			last = code;

			//read the next code
			code = 0;
			for(i = 0; i < codeSize; i++){
				if(data.charCodeAt(pos >> 3) & (1 << (pos & 7))){
					code |= 1 << i;
				}
				pos++;
			}

			if(code === eoiCode){
				break;
			}

			if(code === clearCode){
				//clear out the dictionary
				dict = [];
				codeSize = minCodeSize + 1;
				for(i = 0; i < clearCode; i++){
					dict[i] = [i];
				}
				dict[clearCode] = [];
				dict[eoiCode] = null;

				continue;
			}

			if(code < dict.length){
				if(last !== clearCode){
					res = [];
					res.push.apply(res,dict[last]);
					res.push.call(res,dict[code][0]);
					dict.push(res);
				}
			} else {
				if(code !== dict.length){
					throw new Error('Invalid LZW code.');
				}
				res = [];
				res.push.apply(res,dict[last]);
				res.push.call(res,dict[last][0]);
				dict.push(res);
			}
			output.push.apply(output, dict[code]);

			// If we're at the last code and codeSize is 12, the next code will be a clearCode, and it'll be 12 bits long.
			if(dict.length === (1 << codeSize) && codeSize < 12){
				codeSize++;
			}
		}

		return output;
	}
	function readSubBlocks(st){
		var data = '',
			size;
		do{
			size = st.readByte();
			data += st.read(size);
		} while(size !== 0);

		return data;
	}
	function parseCT(entries,st) { // Each entry is 3 bytes, for RGB.
		var ct = [], i;
		for(i = 0; i < entries; i++){
			ct.push(st.readBytes(3));
		}
		return ct;
	}

	var parse = {
		gif: function(st,handler){
			handler = handler||{};

			parse.header(st,handler);
			parse.block(st,handler);
		},
		header: function(st,handler){
			//load the header information
			var sig = st.read(3);
			if(sig !== 'GIF'){
				throw new Error('Not a GIF file.');
			}

			var hdr = {
				sig: sig,
				ver: st.read(3),
				width: st.readUnsigned(),
				height: st.readUnsigned(),
				_bits: byteToBitArr(st.readByte()),
				bgColor: st.readByte(),
				pixelAspectRatio: st.readByte()
			}, more = {
				gctFlag: hdr._bits.shift(),
				colorRes: bitsToNum(hdr._bits.splice(0, 3)),
				sorted: hdr._bits.shift(),
				gctSize: bitsToNum(hdr._bits.splice(0, 3))
			};

			if(more.gctFlag){
				more.gct = parseCT(1 << (more.gctSize + 1),st);
			}

			delete hdr._bits;

			handler.hdr && handler.hdr(squish(hdr,more));
		},
		block: function(st,handler){
			var block = {
				sentinel: st.readByte(),
				type: null
			};

			switch(String.fromCharCode(block.sentinel)){ // For ease of matching
				case '!':
					block.type = 'ext';
					parse.ext(block,st,handler);
					break;
				case ',':
					block.type = 'img';
					parse.image(block,st,handler);
					break;
				case ';':
					block.type = 'eof';
					handler.eof && handler.eof(block);
					break;
				default:
					throw new Error('Unknown block: 0x' + block.sentinel.toString(16)); // TODO: Pad this with a 0.
			}

			if(block.type !== 'eof'){
				parse.block(st,handler);
			}
		},
		image: function(block,st,handler){
			var deinterlace = function(pixels, width){
				// Of course this defeats the purpose of interlacing. And it's *probably*
				// the least efficient way it's ever been implemented. But nevertheless...
				var newPixels = new Array(pixels.length),
					rows = pixels.length / width,
					offsets = [0,4,2,1],
					steps   = [8,8,4,2],
					fromRow = 0,
					pass, toRow, fromPixels;

				for(pass = 0; pass < 4; pass++) {
					for(toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
						newPixels.splice.apply(newPixels, [toRow * width, width].concat(
							pixels.slice(fromRow * width, (fromRow + 1) * width)
						));
						fromRow++;
					}
				}

				return newPixels;
			}, more = {
				leftPos: st.readUnsigned(),
				topPos: st.readUnsigned(),
				width: st.readUnsigned(),
				height: st.readUnsigned(),
				_bits: byteToBitArr(st.readByte()),
				lzwMinCodeSize: st.readByte(),
				pixels: null
			}, _more = {
				lctFlag: more._bits.shift(),
				interlaced: more._bits.shift(),
				sorted: more._bits.shift(),
				reserved: more._bits.splice(0,2),
				lctSize: bitsToNum(more._bits.splice(0,3))
			};
			if(_more.lctFlag){
				_more.lct = parseCT(1 << (_more.lctSize + 1),st);				
			}
			more.pixels = lzwDecode(more.lzwMinCodeSize, readSubBlocks(st))
			if(_more.interlaced){
				more.pixels = deinterlace(more.pixels, more.width);
			}
			delete more._bits;

			handler.img && handler.img(squish(block,more,_more));
		},
		ext: function(block,st,handler){
			block.label = st.readByte();
			switch(block.label){
				case 0xF9:
					block.extType = 'gce';
					parse.gcext(block,st,handler);
					break;
				case 0xFE:
					block.extType = 'com';
					parse.comext(block,st,handler);
					break;
				case 0x01:
					block.extType = 'pte';
					parse.ptext(block,st,handler);
					break;
				case 0xFF:
					block.extType = 'app';
					parse.appext(block,st,handler);
					break;
				default:
					block.extType = 'unknown';
					parse.unknownext(block,st,handler);
					break;
			}
		},
		gcext: function(block,st, handler){
			var blockSize = st.readByte(),
				bits = byteToBitArr(st.readByte()),
				more = {
					reserved: bits.splice(0,3),
					disposalMethod: bitsToNum(bits.splice(0,3)),
					userInput: bits.shift(),
					transparencyGiven: bits.shift(),
					delayTime: st.readUnsigned(),
					transparencyIndex: st.readByte(),
					terminator: st.readByte(),
				};

			handler.gce && handler.gce(squish(block,more));
		},
		comext: function(block,st,handler){
			block.comment = readSubBlocks(st);
			handler.com && handler.com(block);
		},
		ptext: function(block,st,handler){
			// No one *ever* uses this. If you use it, deal with parsing it yourself.
			var blockSize = st.readByte(); // Always 12
			block.ptHeader = st.readBytes(12);
			block.ptData = readSubBlocks(st);
			handler.pte && handler.pte(block);
		},
		appext: function(block,st,handler){
			var blockSize = st.readByte(); // Always 11
			block.identifier = st.read(8);
			block.authCode = st.read(3);
			switch(block.identifier){
				case 'NETSCAPE':
					parse.netscape(block,st,handler);
					break;
				default:
					parse.unknownApp(block,st,handler);
					break;
			}
		},
		netscape: function(block,st,handler){
			var blockSize = st.readByte(); // Always 3
			block.unknown = st.readByte(); // ??? Always 1? What is this?
			block.iterations = st.readUnsigned();
			block.terminator = st.readByte();
			handler.app && handler.app.NETSCAPE && handler.app.NETSCAPE(block);
		},
		unknownApp: function(block,st,handler){
			block.appData = readSubBlocks(st);
			// FIXME: This won't work if a handler wants to match on any identifier.
			handler.app && handler.app[block.identifier] && handler.app[block.identifier](block);
		},
		unknownext: function(block,st,handler){
			block.data = readSubBlocks(st);
			handler.unknown && handler.unknown(block);
		}
	}

	//a little helper function
	function basic_event(){
		var cache = [],
			self = function(fun){
				if(typeof fun !== 'function'){
					return;
				}
				cache.push(fun);
			};

		self.fire = function(){
			var args = Array.prototype.slice.call(arguments,0),
				i;

			for(i = 0; i < cache.length; i++){
				cache[i].apply(this,args);
			}
		};
		self.disconnect = function(fn){
			for(var i = 0; i < cache.length; i++){
				if(cache[i] !== fn){
					continue;
				}
				cache.splice(i,1);
				return;
			}
		};

		return self;
	}

	// Now we get to cleaning up the weird interface
	return function(){
		var self = {
				width: 0,
				height: 0,
				frames: [],
				current_frame: 0,
				playing: false
			},
			workarea = {
				ready: false,
				transparency: null,
				disposalMethod: null,
				lastDisposalMethod: null,
				startTime: 0,
				delay: 0,
				frame: document.createElement('canvas').getContext('2d')
			},
			total_time = 0,
			play_speed = 1,
			gct;

		self.load = function(url){
			var profile = [],
				start;
			var handler = {
				hdr: function(info){
					self.width = workarea.frame.canvas.width = info.width;
					self.height = workarea.frame.canvas.height = info.height;
					gct = info.gct;
				},
				gce: function(info){
					if(workarea.ready){
						self.frames.push({
							data: workarea.frame.getImageData(0, 0, self.width, self.height),
							startTime: workarea.startTime,
							delay: workarea.delay
						});
						workarea.startTime += workarea.delay;
						workarea.lastDisposalMethod = workarea.disposalMethod;
						workarea.frame.canvas.width = self.width;
					}
					workarea.transparency = info.transparencyGiven ? info.transparencyIndex : null;
					workarea.delay = info.delayTime * 10;
					workarea.disposalMethod = info.disposalMethod;
				},
				img: function(info){
					//object references are really slow in big data sets,
					// so we try to remove those
					var transparency = workarea.transparency,
						lastDisposalMethod = workarea.lastDisposalMethod,
						ct = info.lctFlag ? info.lct : gct,
						cData = workarea.frame.getImageData(info.leftPos, info.topPos, info.width, info.height),
						_data = cData.data,
						pix = info.pixels,
						len = pix.length,
						ctp, i, i4;

					for(i = 0; i < len; i++){
						i4 = i*4;
						if(transparency !== pix[i]){
							ctp = ct[pix[i]];
							_data[i4 + 0] = ctp[0];
							_data[i4 + 1] = ctp[1];
							_data[i4 + 2] = ctp[2];
							_data[i4 + 3] = 255;
						} else {
							if (lastDisposalMethod === 2 || lastDisposalMethod === 3) {
								_data[i4 + 3] = 0;
							}
						}
					}
					workarea.frame.putImageData(cData, info.leftPos, info.topPos);
					workarea.ready = true;
				},
				eof: function(info){
					self.frames.push({
						data: workarea.frame.getImageData(0, 0, self.width, self.height),
						startTime: workarea.startTime,
						delay: workarea.delay
					});

					total_time = workarea.startTime + workarea.delay;

					delete workarea;

					self.play();
					self.on_load.fire(self);
				}
			};

			var xhr = new XMLHttpRequest();
			xhr.overrideMimeType('text/plain; charset=x-user-defined');
			xhr.onload = function(e){
				start = Date.now();
				parse.gif(streamer(xhr.responseText),handler);
			};
			xhr.open('GET', url, true);
			xhr.send();
		};
		self.play = function(){
			self.playing = true;
			self.on_play.fire(self);
			resetStart();
		};
		self.pause = function(){
			self.playing = false;
			self.on_pause.fire(self);
		};
		self.goto = function(index){
			self.current_frame = index%self.frames.length;
			resetStart();
			if(!self.playing){
				//send a draw command out
				window.requestAnimationFrame(function(){
					self.on_frame.fire(self.frames[self.current_frame].data);
				});
			}
		};
		self.speed = function(_speed){
			if(!arguments.length){
				return play_speed;
			}
			_speed = parseFloat(_speed);
			if(isNaN(_speed)){
				return;
			}
			play_speed = _speed;
			resetStart();
		};

		//set up the drawing loop
		var resetStart = (function(){
			var startTime = Date.now();
			function animate(time){
				(function(f){
					f(Date.now());
					window.requestAnimationFrame(animate);
				})(function(t){
					if(!self.playing){
						return;
					}

					var diff = ((t - startTime)*play_speed)%total_time,
						len = self.frames.length,
						curr = self.current_frame,
						ni,f;

					for(ni = 0; ni < len; ni++){
						f = self.frames[(curr+ni)%len];
						if(diff < f.startTime || diff > f.startTime + f.delay){
							continue;
						}
						if(ni === self.current_frame){
							return;
						}
						self.current_frame = (curr+ni)%len;
						self.on_frame.fire(self.frames[self.current_frame].data);

						return;
					}
				});
			}
			window.requestAnimationFrame(animate);

			return function(){
				if(!self.playing){
					return;
				}
				startTime = Date.now() - (self.frames[self.current_frame].startTime/play_speed);
			};
		})();

		self.on_load = basic_event();
		self.on_frame = basic_event();
		self.on_play = basic_event();
		self.on_pause = basic_event();

		return self;
	};
})();
