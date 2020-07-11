# Oleg

[Run Oleg live here](https://MrCarroll.github.io/oleg)

Oleg is a small WebRTC project I made to emulate the utility of the [Cinema gamemode](https://steamcommunity.com/workshop/filedetails/discussion/143148073/3500920615279557342/) of Garry's Mod servers in a native browser environment. It enables a user and a friend to watch content together.

It is a weekend project aimed to be simple, and demonstrate P2P connections over [WebRTC](https://webrtc.org/) without the use of a signalling server via manual exchange of [SDP](https://en.wikipedia.org/wiki/Session_Description_Protocol) metadata. A user can send their SDP profile over email, IM, etc, and establish a connection where the [ICE](https://en.wikipedia.org/wiki/Interactive_Connectivity_Establishment) protocol allows.

Oleg makes use of the publically available STUN server hosted by [stunprotocol.org](http://stunprotocol.org/) and the [invidio.us](https://invidio.us/) project API for collection of YouTube metadata. 

# Using Oleg

Upon visiting the Oleg page, two users (or alternatively, two different browser tabs on the same physical machine) must begin to exchange their SDP profiles. One user should assume the role of the host, who will initiate an offer and must send this offer to the guest over any out of band medium. The guest should copy the offer and acknowledge it, generating their own answer in return. This should be copied back to the host, who will acknowledge the answer. If this is done properly, a connection should be established between host and guest, proceeding to the main interface. This process could be improved by introducing an actual signalling server, but I have opted to personally avoid rolling my own infrastructure due to lack of desire and personal need.

It should be noted due to network architecture, success may work if either party initiates, may only work if one party initiates, or may not work at all. This is primarily due to NAT concerns of modern networking implementations, firewalls, etc.

Upon accessing the main interface, the user may press the Q button to open/close the queue overlay, where content may be added to be played. The queue, current video, skipping around the video, pausing and resuming are all synchronised across the two peers.

