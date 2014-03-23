var SAMPLE_RATE = 44100;
var START_FRAME = 101756;
var MARKER_DISTANCE = 407084.1667;
var OVERLAP = 5000;

var GROUND_OFFSET = -8000;

var GROUND_GAIN = 1.0;
var C1_GAIN = 1.2;
var C2_GAIN = 0.8;

function toSeconds(frames) {
  return frames / SAMPLE_RATE;
}

console.log("markerInSeconds", toSeconds(MARKER_DISTANCE));

var cx = new AudioContext();

var clickBuffer;
var groundBuffer;
var c1Buffer;
var c2Buffer;

function $(id) {
  return document.getElementById(id);
}

function getAudio(url, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url);
  xhr.responseType = "arraybuffer";
  xhr.onload = function(event) {
    console.log("onload", url, xhr.response);
    cx.decodeAudioData(xhr.response, cb);
  };
  xhr.send();
}

function done() {
  if (clickBuffer && groundBuffer && c1Buffer && c2Buffer) {
    $("gobutton").disabled = false;
  }
}

getAudio("Click Track.wav", function(buffer) {
  clickBuffer = buffer;
  done();
});
getAudio("Claire Ground 1.wav", function(buffer) {
  groundBuffer = buffer;
  done();
});
getAudio("Ellie 2.wav", function(buffer) {
  c1Buffer = buffer;
  done();
});
getAudio("Mom 2.wav", function(buffer) {
  c2Buffer = buffer;
  done();
});

var gIterations = [];
var gTimeout = null;

function getSolo() {
  var items = $("picker").solo;
  for (var i = 0; i < items.length; ++i) {
    if (items[i].checked) {
      return items[i].value;
    }
  }
  return undefined;
}

function createGain(baseval, name) {
  var gain = cx.createGain();
  var val = baseval;
  var solo = getSolo();
  if (solo !== undefined && solo != "none" && solo != name) {
    val = val * 0.1;
  }
  gain.gain.value = val;
  console.log("gain", name, val);
  return gain;
}

function Iteration(iteration, start) {
  var source, gain, i;
  this.buffers = [];
  this.iteration = iteration;
  this.start = start;
  if ($("ground").checked) {
    source = cx.createBufferSource();
    source.buffer = groundBuffer;
    gain = createGain(GROUND_GAIN, "ground");
    source.connect(gain);
    gain.connect(cx.destination);
    source.start(start, toSeconds(START_FRAME - OVERLAP - GROUND_OFFSET), toSeconds(MARKER_DISTANCE));
    this.buffers.push(source);
  }

  for (i = 0; i < 3; ++i) {
    var name = "c1-" + (i + 1);
    if ($(name).checked) {
      source = cx.createBufferSource();
      source.buffer = c1Buffer;
      gain = createGain(C1_GAIN, name);
      source.connect(gain);
      gain.connect(cx.destination);
      var marker = 1 + (iteration + i) % 3;
      source.start(start, toSeconds(START_FRAME + MARKER_DISTANCE * marker - OVERLAP),
                   toSeconds(MARKER_DISTANCE));
      this.buffers.push(source);
    }
  }

  for (i = 0; i < 2; ++i) {
    var name = "c2-" + (i + 1);
    if ($(name).checked) {
      source = cx.createBufferSource();
      source.buffer = c2Buffer;
      gain = createGain(C2_GAIN, name);
      source.connect(gain);
      gain.connect(cx.destination);
      var marker = 4 + (iteration + i) % 2;
      source.start(start, toSeconds(START_FRAME + MARKER_DISTANCE * marker - OVERLAP),
                   toSeconds(MARKER_DISTANCE));
      this.buffers.push(source);
    }
  }

  if ($("clicks").checked) {
    source = cx.createBufferSource();
    source.buffer = clickBuffer;
    source.connect(cx.destination);
    source.start(start, toSeconds(START_FRAME - OVERLAP), toSeconds(MARKER_DISTANCE));
    this.buffers.push(source);
  }
}
Iteration.prototype.disconnect = function() {
  while (this.buffers.length) {
    var b = this.buffers.pop();
    b.disconnect();
  }
};

function go() {
  if (gTimeout === null) {
    _next();
  }
}

function _next() {
  var start, iteration;
  if (!gIterations.length) {
    iteration = 0;
    start = cx.currentTime + 0.2;
  }
  else {
    var lastIter = gIterations[gIterations.length - 1];
    iteration = (lastIter.iteration + 1) % 6;
    start = lastIter.start + toSeconds(MARKER_DISTANCE);
  }
  while (gIterations.length && gIterations[0].time + toSeconds(MARKER_DISTANCE) < cx.currentTime) {
    gIterations.shift().disconnect();
  }
  console.log(iteration, start, cx.currentTime);
  gIterations.push(new Iteration(iteration, start));

  var timeout = start + toSeconds(MARKER_DISTANCE) - cx.currentTime - 0.3;
  gTimeout = setTimeout(_next, timeout * 1000);
}

function stop() {
  clearTimeout(gTimeout);
  gTimeout = null;
  while (gIterations.length) {
    gIterations.shift().disconnect();
  }
}