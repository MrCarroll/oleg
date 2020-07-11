var queue; //  Backing container array for all videos in the queue
var video;  //   The video element of the main Oleg page
var PC1SynTextarea; //  These contain the Session Description Profile either input by the user or automatically generated
var PC2SynTextarea;
var PC2SynAckTextarea;
var PC1AckTextarea;
var addToQueueInput;    //  Input box containing video URLs to be added to the queue
var connectionl;    //  RTCPeerConnection object representing the connection between peers
var dataChannel;    //  RTCDataChannel object that state synchronisation happens over.
var queueList;  // Div containing videos in the queue
var currentYTVideo; //  Stores the actively playing element from Youtube, seperate to the queue.
var synButton;  //  Button for triggering syn(), and so on:
var synAckButton;
var ackButton;
var lastSync;   //  Object containing the last message send by the peer
var timeout;    //  Unix timestamp to prevent excessive synchronisation events from interface spam

function syn(){ // Named roughly after the TCP handshake, syn reflects PC1 sending an offer to PC2
    try{
        connection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.stunprotocol.org'}]
            });
    } catch(exception){
        console.log(exception);
    }

    connection.addEventListener("icecandidate", async event => {
        console.log(event);
        PC1SynTextarea.value = JSON.stringify(connection.localDescription);
    });

    connection.addEventListener("iceconnectionstatechange", () => {
        if (document.getElementById("mainContainer").style.display == "none")
        {
            return;
        }
        if (connection.iceConnectionState == "disconnected"){
            alert("The other peer may have disconnected");
        }
        if (connection.iceConnectionState == "failed"){
            alert("The other peer has most likely disconnected");
        }
        if (connection.iceConnectionState == "closed"){
            alert("The other peer has disconnected and cannot reconnect, content will continue to play but will not sync");
        }
        if (connection.iceConnectionState == "connected"){
            alert("The other peer has connected and is now syncing");
        }
    });

    dataChannel = connection.createDataChannel("data");

    dataChannel.addEventListener("open", async event => {
        console.log(event);
        document.getElementById("mainContainer").style.display = "";
        document.getElementById("setupContainer").style.display = "none";
    });

    dataChannel.addEventListener("message",  async event => {
        console.log(event);
        lastSync = JSON.parse(event.data);
        handleSyncState();
    });

    createOfferPromise = connection.createOffer().then(
        async offer => {
            console.log(offer);
            connection.setLocalDescription(offer).then(
                async event => {
                    console.log(event);
                    PC1SynTextarea.value = JSON.stringify(connection.localDescription);
                }
            );
        }
        ).catch(async error => {
            console.log(error);
    });

    //  Disable interface elements
    synButton.disabled = true;
    synAckButton.disabled = true;
    ackButton.disabled = false;
    PC2SynAckTextarea.readOnly = true;
}



function syncState(){
    var state = {
        paused : video.paused,
        time: video.currentTime,
        queue: queue,
        src: video.currentSrc,
        currentYTVideo: currentYTVideo
    };
    dataChannel.send(JSON.stringify(state));
}

function handleSyncState(){
    var currentTime = new Date().getTime();
    if (currentTime < timeout){
        console.log("Recieving too many messages, temporarily refusing to process them");
        return;
    }

    timeout = currentTime + 500;
    var shouldGenerateQueue = false;

    if (video.currentSrc != lastSync.src){
        video.src = lastSync.src;
        video.load();
    }
    if (lastSync.paused){
        video.pause();
    }
    if (video.paused == true && lastSync.paused == false){
        video.play();
    }
    
    if (currentYTVideo.videoId != lastSync.currentYTVideo.videoId){
        currentYTVideo = lastSync.currentYTVideo;
        shouldGenerateQueue = true;
    }

    //  Don't focus on syncing too precisely, or the clients may end up in states they never agree who is correct, causing stuttering and looping of small segments.
    if (Math.abs(video.currentTime - lastSync.time) > 3){
        video.currentTime = lastSync.time;
        console.log("Synchronising video time due to too large a difference");
    } else{
        console.log("Avoiding synchronising video due to acceptable difference");
    }
    
    //  If the queue lengths are different, they're out of sync, be lazy and simply rebuild unconditionally.
    if (queue.length != lastSync.queue.length){
        queue = lastSync.queue;
        console.log("Queue out of sync, overwriting with peers queue");
        shouldGenerateQueue = true;
    }

    //  If the queue lengths are the same, check the videoID's of every member in the queue. If they all match, the queue doesn't need to be rebuilt.
    //  This saves excessive rebuilding on simply pausing, unpausing, and seeking a video.
    //  Excessive rebuilding is particularly bad as the browser tends to purge thumbnails on rebuild, triggering excessive HTTP events.
    for (var i = 0; i < queue.length; i++){
        if (queue[i].videoId != lastSync.queue[i].videoId){
            queue = lastSync.queue;
            console.log("Queue out of sync, overwriting with peers queue");
            shouldGenerateQueue = true;
        }
    }

    if (shouldGenerateQueue){
        generateQueueDisplay();
    }
}

function synAck(){
    try{
        connection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.stunprotocol.org'}]
            })
    } catch(error){
        console.log(error);
    }

    connection.addEventListener("icecandidate", async event => {
        PC2SynAckTextarea.value = JSON.stringify(connection.localDescription);
    })

    connection.addEventListener("datachannel", async event => {
        console.log(event);
        dataChannel = event.channel;
        dataChannel.onmessage = async event => {
            console.log(event);
            lastSync = JSON.parse(event.data);
            handleSyncState();
        }
        document.getElementById("mainContainer").style.display = "";
        document.getElementById("setupContainer").style.display = "none";
    });

    connection.addEventListener("iceconnectionstatechange", () => {
        if (document.getElementById("mainContainer").style.display == "none")
        {
            return;
        }
        if (connection.iceConnectionState == "disconnected"){
            alert("The other peer may have disconnected");
        }
        if (connection.iceConnectionState == "failed"){
            alert("The other peer has most likely disconnected");
        }
        if (connection.iceConnectionState == "closed"){
            alert("The other peer has disconnected and cannot reconnect");
        }
        if (connection.iceConnectionState == "connected"){
            alert("The other peer has connected and is now syncing");
        }
    });

    connection.setRemoteDescription(JSON.parse(PC2SynTextarea.value)).then(
        async event => {
            console.log(event);
            connection.createAnswer().then(
                async answer => {
                    console.log(event);
                    connection.setLocalDescription(answer).then(
                        async event => {
                            console.log(event);
                            PC2SynTextarea.value = JSON.stringify(connection.localDescription);
                        })
                })
        }).catch(
            async error => {
                console.log(error);
            }
        );
    
    //  Disable interface elements
    synAckButton.disabled = true;
    synButton.disabled = true;
    ackButton.disabled = true;
    PC1AckTextarea.readOnly = true;
    PC2SynTextarea.readOnly = true;
}

function ack(){
    connection.setRemoteDescription(JSON.parse(PC1AckTextarea.value)).then(
        async (event) => {
            console.log(event);
        }
    ).catch(
        async error => {
            console.log(error);
        }
    );

}

// Generic video pages require regex because the format of the URL changes substantially.
function addYoutubeSrcVideo(){
    addYoutubeSrc(addToQueueInput.value.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=))([\w\-]{10,12})\b/)[1]);
    addToQueueInput.value = "";
}

// Playlists that I've seen have a specific form, and can handled without regex.
function addYoutubeSrcPlaylist(URL){
    var API = "https://invidio.us/api/v1/playlists/";
    var ID = new URLSearchParams(URL).get("list");
    var tempQueue = [];

    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onload = async function() {
        for (var video of JSON.parse(this.responseText).videos){
            await _addYoutubeSrc(video.videoId).then( (result) => {
                tempQueue.push(result);
            }).catch( (error) => {
                console.log("Error processing " + video.videoId + " " + error);
            })
        }
        queue = queue.concat(tempQueue);
        syncState();
        generateQueueDisplay();
        console.log ("Merged playlist of length: " + tempQueue.length);
    };
    xmlhttp.open("GET", API + ID, true);
    xmlhttp.send();
}

async function _addYoutubeSrc(ID){
    return new Promise((resolve, reject) => {
        var API = "https://invidio.us/api/v1/videos/"

        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", API + ID, true);

        xmlhttp.onload = function() {
            if (this.readyState == 4 && this.status == 200) {
                console.log("Parsed metadata of: " + ID);
                resolve(JSON.parse(this.responseText));
            } else{
                reject(xmlhttp.status);
            }
        };
        xmlhttp.send();
    });
}

function addYoutubeSrc(ID){
    _addYoutubeSrc(ID).then((result) => {
        queue.push(result);
        syncState();
        generateQueueDisplay();
    });
}



function loadNextVideo(){
    // Happens if the button is pressed with nothing in the queue or to break the recursivity of this function.
    if (queue.length == 0){
        console.log("No video in queue to load");
        return;
    }

    // Sometimes although video metadata is gathered, there is no suitable file to play, so the next video should be played instead.
    if (queue[0].formatStreams.length == 0){
        console.log("Skipped " + queue[0].title + " due to no suitable video file");
        currenYTVideo = queue.shift();
        generateQueueDisplay();
        syncState();
        return;
    }

    document.getElementById("videoFrame").src = queue[0].formatStreams[queue[0].formatStreams.length - 1].url;
    currentYTVideo = queue.shift();
    document.getElementById("videoFrame").play(); // Rely on implicit state sync of play event handler
    generateQueueDisplay();
}

function init(){
    queue = [];
    PC1SynTextarea = document.getElementById("PC1SynTextarea");
    PC2SynTextarea = document.getElementById("PC2SynTextarea");
    PC2SynAckTextarea = document.getElementById("PC2SynAckTextarea");
    PC1AckTextarea = document.getElementById("PC1AckTextarea");
    queueList = document.getElementById("queuedItemsContainer");
    video = document.getElementById("videoFrame");
    addToQueueInput = document.getElementById("addToQueueInput");
    currentYTVideo = {};
    synButton = document.getElementById("synButton");
    synAckButton = document.getElementById("synAckButton");
    ackButton = document.getElementById("ackButton");
    lastSync = null;
    timeout = 0;

    document.getElementById("mainContainer").style.display = "none";
    PC1SynTextarea.value = "";
    PC1AckTextarea.value = "";
    PC2SynTextarea.value = "";
    PC2SynAckTextarea.value = "";


    document.onkeydown = (event) => {
        if (event.key == 'q'){
            if (document.getElementById("queueContainer").style.visibility == "hidden"){
                document.getElementById("queueContainer").style.visibility = "visible";
            } else{
                document.getElementById("queueContainer").style.visibility = "hidden";
            }
        }
    };

    video.addEventListener('ended', 
        () => {
            loadNextVideo();
        }
    );

    video.addEventListener('seeked', 
        () => {
            syncState();
        }
    );

    video.addEventListener('pause', 
        () => {
            if (lastSync == null){
                syncState();
                lastSync = null;
                return;
            }
            if (!lastSync.paused){
                syncState();
            }
        }
    );

    video.addEventListener('play', 
        () => {
            if (video.controls == false){
                video.controls = true;
            }


            if (lastSync == null){
                syncState();
                lastSync = null;
                return;
            }
            if (!lastSync.play){
                syncState();
            }
        }
    );

    video.addEventListener('error', 
    (error) => {
        console.log(error);
    }
);
    
}

async function generateQueueDisplay(){
    if (queue == []){
        console.log("Nothing in queue to display");
        return;
    }


    queueList.innerHTML = "";
    var position = 0;

    //  Now playing
    
    //  Check currentYTVideo isn't empty
    if (Object.keys(currentYTVideo).length !== 0){
        var nowPlayingDiv = document.createElement("div");
        nowPlayingDiv.className = "playingVideo";
        nowPlayingDiv.style.backgroundImage = "URL(" + currentYTVideo.videoThumbnails[0].url +  ")";
        
        var title = document.createElement("p");
        title.innerHTML = "Currently Playing: " + currentYTVideo.title;

        var skipButton = document.createElement("button");
        skipButton.innerHTML = "Skip";
        skipButton.setAttribute("onclick", "loadNextVideo()");

        nowPlayingDiv.appendChild(title);
        nowPlayingDiv.appendChild(skipButton);
        queueList.appendChild(nowPlayingDiv);
    }

    for (var video of queue){
        var queuedVideoDiv = document.createElement("div");
        queuedVideoDiv.className = "queuedVideo";
        queuedVideoDiv.style.backgroundImage = "URL(" + video.videoThumbnails[0].url + ")";

        var title = document.createElement("p");
        title.innerHTML = video.title;

        var removeButton = document.createElement("button");
        removeButton.innerHTML= "Remove from Queue";
        removeButton.setAttribute("onclick", "removeFromQueue(" + position + ")");


        queuedVideoDiv.appendChild(title);
        queuedVideoDiv.appendChild(removeButton);
        queueList.appendChild(queuedVideoDiv);

        position++;

    }
}

function removeFromQueue(position){
    queue.splice(position, 1);
    syncState();
    generateQueueDisplay();
}