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
var notificationContainer;    // Div container notification UI
var notificationContainerText;   // Contents of ^
var errorMessage;  //  Used to send error messages between peers to show in notifications.
var canPlay;    //  Used to send a message to the other peer that we are ready to begin playback
var peerCanPlay;    //  Used to begin playback by determining when the other peer is ready.

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
        if (connection.iceConnectionState == "disconnected"){
            showNotification("The other peer may have disconnected");
        }
        if (connection.iceConnectionState == "failed"){
            showNotification("The other peer has most likely disconnected");
        }
        if (connection.iceConnectionState == "closed"){
            showNotification("The other peer has disconnected and cannot reconnect, content will continue to play but will not sync");
        }
        if (connection.iceConnectionState == "connected"){
            showNotification("The other peer has connected and is now syncing");
        }
    });

    dataChannel = connection.createDataChannel("data");

    dataChannel.addEventListener("open", async event => {
        document.getElementById("mainContainer").classList.remove("displayNone");
        document.getElementById("setupContainer").classList.add("displayNone");
    });

    dataChannel.addEventListener("message",  async event => {
        lastSync = JSON.parse(event.data);
        handleSyncState();
    });

    createOfferPromise = connection.createOffer().then(
        async (offer) => {
            connection.setLocalDescription(offer).then(
                async (event) => {
                    PC1SynTextarea.value = JSON.stringify(connection.localDescription);
                }
            );
        }
        ).catch(async (error) => {
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
        currentYTVideo: currentYTVideo,
        error: errorMessage,
        playable: canPlay
    };
    dataChannel.send(JSON.stringify(state));
}

// sync data has already been parsed and is available in lastSync
function handleSyncState(){

    //  Ignore the other timeouts below intentionally.
    if (lastSync.playable == true && canPlay == true){
        video.play();
        canPlay = false;
        peerCanPlay = false;
        return;
    } else{
        peerCanPlay = true;
    }

    //  Prevent too many synchronisation attempts to prevent recursion with due to latency.
    var currentTime = new Date().getTime();
    if (currentTime < timeout){
        console.log("Recieving too many messages, temporarily refusing to process them");
        return;
    }

    timeout = currentTime + 500;
    var shouldGenerateQueue = false;

    if (lastSync.error !== ""){
        showNotification(lastSync.error);
        return;
    }

    //  Handle playback events of media mid play
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
    
    //  Swap video if the other peer has changed
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

//  Named roughly after TCP handshake, PC1 has recieved PC2's response and the connection fully establishes
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
        dataChannel = event.channel;
        dataChannel.onmessage = async event => {
            lastSync = JSON.parse(event.data);
            handleSyncState();
        }
        document.getElementById("mainContainer").classList.remove("displayNone");
        document.getElementById("setupContainer").classList.add("displayNone");
    });

    connection.addEventListener("iceconnectionstatechange", () => {
        if (connection.iceConnectionState == "disconnected"){
            showNotification("The other peer may have disconnected");
        }
        if (connection.iceConnectionState == "failed"){
            showNotification("The other peer has most likely disconnected");
        }
        if (connection.iceConnectionState == "closed"){
            showNotification("The other peer has disconnected and cannot reconnect");
        }
        if (connection.iceConnectionState == "connected"){
            showNotification("The other peer has connected and is now syncing");
        }
    });

    connection.setRemoteDescription(JSON.parse(PC2SynTextarea.value)).then(
        async (event) => {
            connection.createAnswer().then(
                async (answer) => {
                    connection.setLocalDescription(answer).then(
                        async (event) => {
                            PC2SynTextarea.value = JSON.stringify(connection.localDescription);
                        })
                })
        }).catch(
            async (error) => {
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

//  Named roughly after the TCP handshake, PC2 begins to connect to PC1
function ack(){
    connection.setRemoteDescription(JSON.parse(PC1AckTextarea.value)).then(
        async (event) => {
        }
    ).catch(
        async (error) => {
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
    var API = "https://invidious.snopyta.org/api/v1/playlists/";
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
        var API = "https://invidious.snopyta.org/api/v1/videos/"
        var fields = "?fields=videoId,title,formatStreams,videoThumbnails"

        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", API + ID + fields, true);

        xmlhttp.onload = function() {
            if (this.readyState == 4 && this.status == 200) {
                console.log("Parsed metadata of: " + ID);
                var retval = JSON.parse(this.responseText);
                retval.videoThumbnails = retval.videoThumbnails[0].url; //  This contains a lot of unnecessary data that adds network overhead, so remove it.
                resolve(retval);
            } else{
                showNotification("Error adding videoID: " + ID);
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
    document.getElementById("videoFrame").load(); // Rely on implicit state sync of play event handler
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
    notificationContainer = document.getElementById("notificationsContainer");
    notificationContainerText = document.getElementById("notification");
    errorMessage = "";
    canPlay = false;
    peerCanPlay = false;

    PC1SynTextarea.value = "";
    PC1AckTextarea.value = "";
    PC2SynTextarea.value = "";
    PC2SynAckTextarea.value = "";


    document.onkeydown = (event) => {
        if (event.key == 'q'){
            document.getElementById("queueContainer").classList.toggle("displayNone");
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

    video.addEventListener('playing', 
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
            showNotification("Attempt to load video has failed, the peers may not be fully synced as a result.");
            errorMessage = "The peer failed to play a video from the queue. ( " + currentYTVideo.title + " )";
            syncState();
            errorMessage = "";
        }
    );
    
    video.addEventListener('canplay',
        (event) => {
            if (peerCanPlay == true){
                video.play();
                canPlay = false;
                peerCanPlay = false;
            }
            canPlay = true;
            syncState();
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
        nowPlayingDiv.style.backgroundImage = "URL(" + currentYTVideo.videoThumbnail +  ")";
        
        var title = document.createElement("p");
        title.innerHTML = "Currently Playing: " + currentYTVideo.title;

        var skipButton = document.createElement("button");
        skipButton.innerHTML = "Skip";
        skipButton.setAttribute("onclick", "loadNextVideo()");

        nowPlayingDiv.appendChild(title);
        nowPlayingDiv.appendChild(skipButton);
        queueList.appendChild(nowPlayingDiv);
    }

    //  Generate the actual queue objects display
    for (var video of queue){
        var queuedVideoDiv = document.createElement("div");
        queuedVideoDiv.className = "queuedVideo";
        queuedVideoDiv.style.backgroundImage = "URL(" + video.videoThumbnail + ")";

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

function showNotification(text){
    notificationContainerText.innerHTML = text;
    notificationsContainer.classList.remove("displayNone");
    setTimeout(() => {
        notificationContainerText.innerHTML = "";
        notificationsContainer.classList.add("displayNone");
    }, 5000);
}