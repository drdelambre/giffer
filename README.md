giffer.js
======
> Access your amazing GIF files in javascript. Change their playback, skip around, add filters, export individual frames, the data once locked away in the world of desktop applications is now yours in the browser.

## Basic Usage
The work flow is pretty simple. Load a GIF from a url on the internet, give it a second, and you're good to go. Here's a basic overview of the interface
#### ```load(url)```
grabs a gif from the internet and rips it to pieces
#### ```play()```
starts playing the gif
#### ```pause()```
stops playing the gif
#### ```goto(index)```
jumps to a frame within the animation. to see how many frames are in an animation, check the length of the array _gif.frames.length_
#### ```speed(float)```
to play at half speed, call _speed(0.5)_ to play twice as fast, call _speed(2)_

## The Event System
There's also events you can subscribe to within the gif. These help when you have multiple interfaces talking to a gif. Register as many callbacks as you want.
#### ```on_load(callback)```
gets fired once the gif has been downloaded and the data is ready
#### ```on_frame(callback)```
there's a built in animation handler. this gets called whenever the frame has changed and is ready to draw.
#### ```on_play(callback)```
fired whenever the gif starts playing
#### ```on_pause(callback)```
fired when the gif is paused

## Rendering
All rendering is handled outside this module, but that doesn't mean the documentation should leave you hanging! There's also the example code if you want to skip ahead into something a little more complex.
```Javascript
var myelement = $dd.dom('#dance'),
	frame_buffer = document.createElement('canvas'),
	gif = Giffer();

gif.on_frame(function(img_data){
	frame_buffer.width = gif.width;
	frame_buffer.height = gif.height;
	frame_buffer.getContext('2d').putImageData(_gif,0,0);

	myelement.css({
		width: gif.width + 'px',
		height: gif.height + 'px',
		'background-image': frame_buffer.toDataURL()
	});
});

gif.load('http://i.imgur.com/98BbqFr.gif');
```