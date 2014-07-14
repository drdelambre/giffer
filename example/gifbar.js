//
// Gifbar.js
//
// An example scrubber for using Giffer.js
// Just give a DOM node a data-gif attribute that points at it's gif
// I know this is some ugly code, but it's just to illustrate how to setup
// an interface, so shaaaaadap
var Gifbar = (function(){
	// polyfill for using querySelectorAll in old doms
	document.querySelectorAll = document.querySelectorAll||function(selector){
		var doc = document,
			head = doc.documentElement.firstChild,
			styleTag = doc.createElement('style');
		head.appendChild(styleTag);
		doc._qsa = [];

		styleTag.styleSheet.cssText = selector + "{x:expression(document._qsa.push(this))}";
		window.scrollBy(0, 0);

		return doc._qsa;
	};
	// a dead simple document ready. doesn't always work
	var ready = (function(){
		var cache = [],
			rep = function(){
				if(!document.body){
					return;
				}
				clearInterval(inter);
				inter = null;
				for(var ni = 0; ni < cache.length; ni++){
					cache[ni]();
				}
				delete cache;
			},
			inter = setInterval(rep,10);

		rep();

		return function(f){
			if(typeof f !== 'function'){
				return;
			}
			if(inter === null){
				f();
			} else {
				cache.push(f);
			}
		};
	})();

	// the js wrapper
	function player(node){
		var self = {},
			fb = document.createElement('canvas'),
			player = document.createElement('div'),
			gif = Giffer(),
			is_playing = false,
			ni, btn, frame;

		player.innerHTML = document.getElementById('template-player').innerHTML;
		for(var ni = 0, len = player.childNodes.length; ni < len;ni++){
			node.appendChild(player.firstChild);
		}

		btn = node.querySelectorAll('.button')[0];
		frame = node.querySelectorAll('.frame')[0];

		btn.className = 'button pause';
		btn.addEventListener('click',function(e){
			if(is_playing){
				gif.pause();
			} else {
				gif.play();
			}
		});

		function draw(img_data){
			fb.width = gif.width;
			fb.height = gif.height;
			fb.getContext('2d').putImageData(img_data,0,0);
			frame.getElementsByTagName('span')[0].style.width = (gif.current_frame/gif.frames.length)*100 + '%';

			if(node.nodeName.toLowerCase() === 'img'){
				node.src = fb.toDataURL();
			} else {
				node.style.backgroundImage = 'url(' + fb.toDataURL() + ')';
			}
		}

		gif.on_load(function(){
			gif.pause();
			gif.speed(1.2);
			draw(gif.frames[gif.current_frame].data);
			setTimeout(function(){
				node.querySelectorAll('.player')[0].className = 'player show';
			},5);
			setTimeout(function(){
				gif.play();
			},800);
		});
		gif.on_play(function(){
			btn.className = 'button pause';
			is_playing = true;
		});
		gif.on_pause(function(){
			btn.className = 'button play';
			is_playing = false;
		});

		gif.on_frame(draw);

		gif.load(node.getAttribute('data-gif'));

		return self;
	}

	ready(function(){
		var imgs = document.querySelectorAll("*[data-gif]"),
			ni;
		for(ni = 0; ni < imgs.length; ni++){
			player(imgs[ni]);
		}
	});
})();