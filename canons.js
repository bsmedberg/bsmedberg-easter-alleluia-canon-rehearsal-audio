var SAMPLE_RATE = 44100;
var START_FRAME = 101756;
var MARKER_DISTANCE = 407084.1667;
var OVERLAP = 5000;

var GROUND_OFFSET = -8000;

var GROUND_GAIN = 1.2;
var C1_GAIN = 1.3;
var C2_GAIN = 0.8;

var SOLO_BACKGROUND = 0.2;

function toSeconds(frames) {
  return frames / SAMPLE_RATE;
}

if (window.console === undefined) {
  window.console = { log: function() { } };
}
console.log("markerInSeconds", toSeconds(MARKER_DISTANCE));

if (window.AudioContext === undefined && window.webkitAudioContext) {
  window.AudioContext = window.webkitAudioContext;
}
if (window.AudioContext) {
  $("compatnotice").style.display = "none";
}
var cx = new AudioContext();

function createGain() {
  var gain = cx.createGain();
  gain.connect(cx.destination);
  return gain;
}

var clickGain = createGain();
var groundGain = createGain();
var c1Gains = [createGain(), createGain(), createGain()];
var c2Gains = [createGain(), createGain()];

function rampGainTo(gain, value) {
  var t = cx.currentTime;
  gain.gain.linearRampToValueAtTime(value, t + 0.2);
}  

function getSolo() {
  var items = $("picker").solo;
  for (var i = 0; i < items.length; ++i) {
    if (items[i].checked) {
      return items[i].value;
    }
  }
  return "none";
}

function setupGains() {
  console.log("setupGains");
  var solo = getSolo();

  function setupGain(gain, name, val) {
    if ($(name).checked) {
      if (solo != "none" && solo != name) {
        val = val * SOLO_BACKGROUND;
      }
      rampGainTo(gain, val);
    }
    else {
      rampGainTo(gain, 0);
    }
  }

  setupGain(groundGain, "ground", GROUND_GAIN);
  setupGain(c1Gains[0], "c1-1", C1_GAIN);
  setupGain(c1Gains[1], "c1-2", C1_GAIN);
  setupGain(c1Gains[2], "c1-3", C1_GAIN);
  setupGain(c2Gains[0], "c2-1", C2_GAIN);
  setupGain(c2Gains[1], "c2-2", C2_GAIN);

  if ($("clicks").checked) {
    var val = parseFloat($("clickGain").value);
    if (!isNaN(val)) {
      rampGainTo(clickGain, val);
    }
  }
  else {
    rampGainTo(clickGain, 0);
  }
}
setupGains();

var clickBuffer;
var groundBuffer;
var c1Buffer;
var c2Buffer;
var loadErr = [];

function $(id) {
  return document.getElementById(id);
}

function getAudio(url, cb) {
  var loadItem = document.createElement("li");
  var progress = document.createElement("span");
  progress.setAttribute("class", "progress");
  loadItem.appendChild(progress);
  var span = document.createElement("span");
  span.textContent = url;
  loadItem.appendChild(span);

  function setProgress(pct) {
    pct = Math.floor(pct);
    progress.style.borderLeftWidth = pct + "px";
    progress.style.width = (100 - pct) + "px";
  }

  $("load-list").appendChild(loadItem);
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url);
  xhr.responseType = "arraybuffer";
  xhr.onload = function(event) {
    console.log("onload", url, xhr.response);
    cx.decodeAudioData(xhr.response, cb, function() {
      loadErr.push("Failed to decode " + url);
      done();
    });
  };
  xhr.addEventListener("error", function(e) {
    loadErr.push("Failed to load " + url);
    done();
  }, false);
  xhr.addEventListener("progress", function(e) {
    setProgress(e.loaded / e.total * 100);
  }, false);
  xhr.send();
}

function done() {
  if (clickBuffer && groundBuffer && c1Buffer && c2Buffer) {
    $("load-list").style.display = "none";
    $("gobutton").disabled = false;
    $("status").textContent = "Loaded";
    return;
  }
  if (loadErr.length) {
    $("status").textContent = "Errors: " + loadErr.join(",");
    return;
  }
  var l = [];
  if (!clickBuffer) {
    l.push("Click Track");
  }
  if (!groundBuffer) {
    l.push("Ground Track");
  }
  if (!c1Buffer) {
    l.push("Canon 1 Track");
  }
  if (!c2Buffer) {
    l.push("Canon 2 Track");
  }
  $("status").textContent = "Loading " + l.join(", ") + "...";
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
done();

var gIterations = [];
var gTimeout = null;

function Iteration(iteration, start) {
  var source, i;
  this.buffers = [];
  this.iteration = iteration;
  this.start = start;
  source = cx.createBufferSource();
  source.buffer = groundBuffer;
  source.connect(groundGain);
  source.start(start, toSeconds(START_FRAME - OVERLAP - GROUND_OFFSET), toSeconds(MARKER_DISTANCE));
  this.buffers.push(source);

  for (i = 0; i < 3; ++i) {
    source = cx.createBufferSource();
    source.buffer = c1Buffer;
    source.connect(c1Gains[i]);
    var marker = 1 + (iteration + i) % 3;
    source.start(start, toSeconds(START_FRAME + MARKER_DISTANCE * marker - OVERLAP),
                 toSeconds(MARKER_DISTANCE));
    this.buffers.push(source);
  }

  for (i = 0; i < 2; ++i) {
    source = cx.createBufferSource();
    source.buffer = c2Buffer;
    source.connect(c2Gains[i]);
    var marker = 4 + (iteration + i) % 2;
    source.start(start, toSeconds(START_FRAME + MARKER_DISTANCE * marker - OVERLAP),
                 toSeconds(MARKER_DISTANCE));
    this.buffers.push(source);
  }

  source = cx.createBufferSource();
  source.buffer = clickBuffer;
  source.connect(clickGain);
  source.start(start, toSeconds(START_FRAME - OVERLAP), toSeconds(MARKER_DISTANCE));
  this.buffers.push(source);
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

function openInNewWindow(link) {
  var features = "width=" + (screen.availWidth - 100) + ",height=" + (screen.availHeight - 100) + ",resizable,scrollbars=yes,status=1,centerscreen=1,top=100,left=50";
  console.log("music-window", features);
  window.open(link.href, "_blank", features);
  return false;
}

document.addEventListener("change", setupGains, false);
