let username,password,robotUsername;const loginButton=document.getElementById("login-button"),spawnButton=document.getElementById("spawnButton"),vrButton=document.getElementById("vrButton"),confirmLoginButton=document.getElementById("confirm-login-button"),remoteVideo=document.getElementById("remoteVideo"),enteredpw=document.getElementById("private-password-input"),submitPwBtn=document.getElementById("submit-password-button"),snackbar=document.getElementById("snackbar"),modalLogin=document.getElementById("modal-login"),closeLoginSpan=document.getElementById("close-login-modal"),usernameInput=document.getElementById("username-input"),passwordInput=document.getElementById("password-input"),robotUsernameInput=document.getElementById("robot-username-input"),modalPassword=document.getElementById("modal-enter-password"),pwModalSpan=document.getElementById("close-password-modal"),loadingOverlay=document.getElementById("loadingOverlay"),trackingDataSpan=document.getElementById("tracking-data"),container=document.getElementById("vr-container");let remoteStream,peerConnection,configuration,connectionTimeout,tokenrate,signalingSocket,inputChannel,responseHandlers={},emitter,attemptCount=0,tempPW="";const maxReconnectAttempts=20;let reconnectAttempts=0;const reconnectDelay=2e3;let isGuest=!0;const wsUrl="https://sp4wn-signaling-server.onrender.com";function getCookie(e){let n=("; "+document.cookie).split("; "+e+"=");if(2==n.length)return n.pop().split(";").shift()}function openLoginModal(){modalLogin.style.display="block"}function login(){console.log("Logging in..."),username=usernameInput.value.toLowerCase(),password=passwordInput.value,isGuest=!username||!password,connectToSignalingServer()}async function connectToSignalingServer(){return console.log("Connecting to signaling server..."),new Promise((e,n)=>{signalingSocket=new WebSocket(wsUrl),connectionTimeout=setTimeout(()=>{try{signalingSocket.close()}catch(e){console.log(e)}n(Error("Connection timed out"))},1e4),signalingSocket.onopen=()=>{clearTimeout(connectionTimeout),reconnectAttempts=0,isGuest?send({type:"wslogin",guest:!0}):send({type:"wslogin",username:username,password:password}),e()},signalingSocket.onmessage=async n=>{let t=JSON.parse(n.data);emitter.emit(t.type,t),responseHandlers[t.type]?(responseHandlers[t.type](t),delete responseHandlers[t.type]):await handleSignalingData(t,e)},signalingSocket.onclose=()=>{clearTimeout(connectionTimeout),console.log("Disconnected from signaling server"),handleReconnect()},signalingSocket.onerror=e=>{clearTimeout(connectionTimeout),console.error("WebSocket error:",e),n(e)}})}function send(e){signalingSocket.send(JSON.stringify(e))}function handleReconnect(){if(reconnectAttempts<20){reconnectAttempts++;let e=2e3*reconnectAttempts;console.log(`Reconnecting in ${e/1e3} seconds... (Attempt ${reconnectAttempts})`),setTimeout(connectToSignalingServer,e)}else console.log("Max reconnect attempts reached. Please refresh the page.")}async function handleSignalingData(e,n){switch(e.type){case"authenticated":handleLogin(e.success,e.configuration,e.errormessage,e.username),n();break;case"offer":if(peerConnection){await peerConnection.setRemoteDescription(new RTCSessionDescription(e.offer));let t=await peerConnection.createAnswer();await peerConnection.setLocalDescription(t),send({type:"answer",answer:t,username:username,host:robotUsername})}else console.log("no answer peer connection");break;case"answer":if(peerConnection)try{await peerConnection.setRemoteDescription(new RTCSessionDescription(e.answer))}catch(o){console.error("Error when setting remote description: ",o)}else console.log("no answer peer connection");break;case"watch":watchStream(e.name,e.pw);break;case"endStream":endStream()}}function handleLogin(e,n,t,o){e?e&&(console.log("Successfully logged in"),modalLogin.style.display="none",configuration=n,username=o,console.log(username),isGuest||(loginButton.style.display="none")):"User is already logged in"==t?setTimeout(()=>{send({type:"wslogin",username:username,password:password}),console.log("Retrying login in 10 seconds"),showSnackbar("Retrying login in 10 seconds")},1e4):(console.log("Invalid login",t),showSnackbar("Invalid login",t))}async function initSpawn(){if(tokenrate>0){let e=await checkTokenBalance(username);if(!e){showSnackbar(`Not enough tokens. Rate: ${tokenrate}`),spawnButton.disabled=!1;return}}if(tokenrate<0){let n=checkTokenBalance(robotUsername);if(!n){showSnackbar(`Host doesn't have enough tokens. Rate: ${(Number(tokenrate)/1e6).toFixed(2)} tokens/min`),spawnButton.disabled=!1;return}}await openPeerConnection(),await startStream()}async function startStream(){console.log("starting stream");try{let e=await handleVROnConnection();if(e){console.log("VR loaded"),console.log("Checking ICE connection status...");let n=await checkICEStatus("connected");if(n){if(console.log("ICE connected. Now waiting for data channels to open..."),await waitForChannelsToOpen()){console.log("Data channels are open. Proceeding with video confirmation...");let t=await isStreamLive();if(t){console.log("Stream is receiving data. Attempting token redemption..."),removeVideoOverlayListeners();let o=await startAutoRedeem(tokenrate);o?(console.log("Successfully started stream"),vrButton.style.display="inline-block",spawnButton.textContent="End",spawnButton.onclick=endStream):console.error("Token redemption failed.")}else throw Error("Stream is not live.")}else throw Error("Failed to open data channels.")}else throw Error("ICE connection failed.")}else throw Error("VR failed to load.")}catch(r){showSnackbar("Failed to start stream"),console.error(`Error: ${r.message}`),hideLoadingOverlay(),endStream(),spawnButton.disabled=!1}spawnButton.disabled=!1}function checkTokenBalance(e){return new Promise((n,t)=>{checkUserTokenBalance({type:"checkTokenBalance",username:e,tokenrate:tokenrate}).then(e=>{e.success?n(!0):t(Error("Balance check failed"))}).catch(e=>{t(e)})})}function checkUserTokenBalance(e){return new Promise((n,t)=>{signalingSocket.send(JSON.stringify(e),e=>{e&&t(e)}),emitter.once("balanceChecked",e=>{try{n(e)}catch(o){t(o)}})})}function verifyPassword(e,n){return new Promise((t,o)=>{sendPW({type:"checkPassword",username:e,password:n}).then(e=>{e.success?t(!0):o(Error("Password verification failed"))}).catch(e=>{o(e)})})}async function authenticateCode(e){try{if(e===secretCode)return{success:!0};return{success:!1}}catch(n){return console.log("Failed to authenticate password:",n),{success:!1}}}function sendPW(e){return new Promise((n,t)=>{responseHandlers.authbotpw=e=>{try{n(e)}catch(o){t(o)}},signalingSocket.send(JSON.stringify(e),e=>{if(e){t(e);return}})})}function createOffer(){return new Promise((e,n)=>{peerConnection.createOffer().then(e=>peerConnection.setLocalDescription(e).then(()=>e)).then(n=>{send({type:"offer",offer:n,username:username,host:robotUsername}),e()}).catch(e=>n(e))})}async function start(){if(robotUsername=robotUsernameInput.value,document.cookie=`robotusername=${encodeURIComponent(robotUsername)}; max-age=31536000; path=/`,!robotUsername){showSnackbar("Please enter the robot's username");return}spawnButton.disabled=!0;try{let e=await fetch(`${wsUrl}/fetch-robot-details?username=${encodeURIComponent(robotUsername)}`,{method:"GET",headers:{"Content-Type":"application/json"}});if(!e.ok)throw Error("Error fetching profile");let n=await e.json();if(!n.isLive){showSnackbar("Robot isn't available"),spawnButton.disabled=!1;return}tokenrate=Number(n.tokenrate),n.isPrivate?modalPassword.style.display="block":initSpawn()}catch(t){console.error("Error checking robot status:",t),spawnButton.disabled=!1}}async function openPeerConnection(){peerConnection&&("closed"!==peerConnection.connectionState||"closed"!==peerConnection.signalingState)&&(console.log("An existing PeerConnection is open. Closing it first."),peerConnection.close(),peerConnection=null),await closeDataChannels(),peerConnection=new RTCPeerConnection(configuration),remoteStream=new MediaStream,remoteVideo.srcObject=remoteStream,peerConnection.ontrack=e=>{remoteStream.addTrack(e.track),console.log("Received track:",e.track)},peerConnection.onicecandidate=function(e){console.log("Received ice candidate"),e.candidate&&send({type:"candidate",candidate:e.candidate,othername:robotUsername})},send({type:"watch",username:username,host:robotUsername,pw:tempPW})}async function closeDataChannels(){return new Promise(e=>{peerConnection&&(inputChannel&&"open"===inputChannel.readyState&&(inputChannel.close(),inputChannel=null,console.log("Closed input channel.")),console.log("Closed data channels")),e()})}async function checkICEStatus(e){return(console.log("Checking ICE status"),peerConnection)?new Promise((n,t)=>{let o=0,r=setInterval(()=>{try{console.log("ICE Connection State:",peerConnection.iceConnectionState),peerConnection.iceConnectionState===e||"completed"===peerConnection.iceConnectionState?(clearInterval(r),console.log("ICE connection established."),n(!0)):o>=5?(clearInterval(r),console.error("ICE connection not established within the expected time."),t(Error("ICE connection not established within the expected time."))):o++}catch(a){clearInterval(r),console.error("An error occurred:",a),t(a)}},2e3)}):(console.error("No peer connection available"),Promise.resolve(!1))}async function handleVROnConnection(){return new Promise((e,n)=>{try{initializeVideoOverlay(),setTimeout(()=>{e(!0)},200)}catch(t){console.error("Error in handleVROnConnection:",t),n(!1)}})}function waitForChannelsToOpen(){return new Promise(async e=>{try{let n=await setupDataChannelListenerWithTimeout();e(n)}catch(t){console.error("Error opening channels:",t),e(!1)}})}function setupDataChannelListenerWithTimeout(){return new Promise((e,n)=>{let t=0,o;function r(){1==++t&&(o&&clearTimeout(o),e(!0))}peerConnection.ondatachannel=e=>{let t=e.channel,a=t.label;if(console.log(`Data channel of type "${a}" received.`),"input"===a)handleInputChannel(t,r);else{console.warn(`Unknown data channel type: ${a}`),o&&clearTimeout(o),n(Error(`Unsupported data channel type: ${a}`));return}},o=setTimeout(()=>{n(Error("Timeout: Data channels did not open within 15000 ms"))},15e3)})}function handleInputChannel(e,n){(inputChannel=e).onopen=()=>{n()},inputChannel.onmessage=e=>{console.log("Received input channel message:",e.data)},inputChannel.onclose=()=>{console.log("Input channel has been closed"),exitVR(),endStream()},inputChannel.onerror=e=>{console.error("Input channel error:",e)}}async function isStreamLive(){return new Promise((e,n)=>{if(remoteStream&&remoteStream.getTracks().some(e=>"live"===e.readyState))e(!0);else{let t=()=>{remoteStream&&remoteStream.getTracks().some(e=>"live"===e.readyState)&&(e(!0),clearInterval(o))},o=setInterval(()=>{t()},1e3);setTimeout(()=>{clearInterval(o),n(Error("Stream is not live."))},1e3)}})}async function startAutoRedeem(){return new Promise((e,n)=>{let t={hostname:robotUsername,username:username,tokens:tokenrate};isGuest&&(t={...t,guest:!0}),fetch(`${wsUrl}/redeem`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}).then(e=>{if(!e.ok)throw Error("Network response was not ok");return e.json()}).then(t=>{t.success?(console.log("Auto-redemption initiated on the server."),e(!0)):n(Error(t.error||"Redemption failed"))}).catch(e=>{console.error("Error initiating auto-redemption:",e),n(e)})})}async function stopAutoRedeem(){try{let e={userUsername:username,hostUsername:robotUsername};isGuest&&(e.guest=!0);let n=await fetch(`${wsUrl}/stopAutoRedeem`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)}),t=await n.json();if(t.success)return console.log(t.message),!0;return console.error("Failed to stop auto-redemption:",t.error),!1}catch(o){return console.error("Error stopping auto-redemption:",o),!1}}async function endStream(){console.log("Ending stream"),stopAutoRedeem(),spawnButton.textContent="Spawn",spawnButton.onclick=start,vrButton.style.display="none",remoteVideo.srcObject=null,await closeDataChannels(),peerConnection&&(peerConnection.close(),peerConnection=null)}function showSnackbar(e){try{snackbar.textContent=e,snackbar.className="snackbar show",setTimeout(function(){snackbar.className=snackbar.className.replace("show","")},5e3)}catch(n){console.error("Error showing snackbar:",n)}}function initializeVideoOverlay(){showLoadingOverlay()}function removeVideoOverlayListeners(){hideLoadingOverlay()}function showLoadingOverlay(){loadingOverlay.style.display="flex"}function hideLoadingOverlay(){loadingOverlay.style.display="none"}document.addEventListener("DOMContentLoaded",()=>{let e=getCookie("robotusername");e&&(robotUsernameInput.value=decodeURIComponent(e)),emitter=new EventEmitter3,login()}),pwModalSpan.onclick=function(){modalPassword.style.display="none"},closeLoginSpan.onclick=function(){modalLogin.style.display="none"},submitPwBtn.onclick=async function(){if(""===enteredpw.value){showSnackbar("Please enter a password"),console.log("Please enter a password");return}if(""===robotUsername){showSnackbar("Update robotUsername"),console.log("Update robotUsername");return}submitPwBtn.disabled=!0,submitPwBtn.classList.add("disabled");let e=enteredpw.value;tempPW=e;try{let n=await verifyPassword(robotUsername,e);n?(modalPassword.style.display="none",initSpawn(),attemptCount=0):(attemptCount++,showSnackbar("Failed to authenticate password"))}catch(t){attemptCount++,showSnackbar("Error verifying password"),console.log("Error verifying password:",t)}attemptCount>=3?setTimeout(()=>{submitPwBtn.disabled=!1,submitPwBtn.classList.remove("disabled")},5e3):(submitPwBtn.disabled=!1,submitPwBtn.classList.remove("disabled"))};let scene,camera,renderer,xrSession,referenceSpace,videoMesh;async function setupScene(){if(container.style.display="block",(renderer=new THREE.WebGLRenderer({antialias:!0})).setSize(window.innerWidth,window.innerHeight),renderer.setPixelRatio(window.devicePixelRatio),container.appendChild(renderer.domElement),scene=new THREE.Scene,(camera=new THREE.PerspectiveCamera(90,window.innerWidth/window.innerHeight,.1,1e3)).position.set(0,0,1),remoteVideo.srcObject){console.log("Video source found"),remoteVideo.style.display="none";let e=new THREE.VideoTexture(remoteVideo);e.minFilter=THREE.LinearFilter,e.magFilter=THREE.LinearFilter,e.format=THREE.RGBAFormat;let n=new THREE.MeshBasicMaterial({map:e,side:THREE.FrontSide}),t=remoteVideo.videoWidth/remoteVideo.videoHeight,o=window.innerWidth/window.innerHeight,r,a;t>o?a=(r=2)/t:r=(a=2)*t;let i=new THREE.PlaneGeometry(r,a);(videoMesh=new THREE.Mesh(i,n)).position.set(0,0,-2),scene.add(videoMesh),camera.lookAt(videoMesh.position),camera.aspect=o,camera.updateProjectionMatrix(),remoteVideo.loop=!0,remoteVideo.play(),console.log("Video should now be playing on the plane")}else console.warn("No video stream is set for remoteVideo");let s=new THREE.AmbientLight(16777215,.5);scene.add(s)}function updateVideomeshPosition(e,n){let t=new THREE.Vector3(0,0,-2);t.applyQuaternion(e.quaternion),n.position.copy(e.position).add(t),n.quaternion.copy(e.quaternion)}function animate(){renderer.xr.isPresenting?renderer.setAnimationLoop(()=>{renderer.render(scene,camera)}):(requestAnimationFrame(animate),renderer.render(scene,camera))}async function enterVR(){if(await setupScene(),vrButton.textContent="Exit VR",vrButton.onclick=exitVR,navigator.xr)try{let e=renderer.getContext();await e.makeXRCompatible();let n=await navigator.xr.requestSession("immersive-vr");console.log("Session requested successfully",n),renderer.xr.enabled=!0,renderer.setPixelRatio(window.devicePixelRatio),n.updateRenderState({baseLayer:new XRWebGLLayer(n,renderer.getContext())});let t=await n.requestReferenceSpace("local");function o(e,r){let a=r.getViewerPose(t);if(a){let i=a.transform.position,s=a.transform.orientation;updateVideomeshPosition(camera,videoMesh);let c=[];r.session.inputSources.forEach(e=>{if(e.gripSpace){let n=r.getPose(e.gripSpace,t);n&&c.push({gripPosition:n.transform.position,gripOrientation:n.transform.orientation})}if(e.targetRaySpace){let o=r.getPose(e.targetRaySpace,t);o&&c.push({targetPosition:o.transform.position,targetOrientation:o.transform.orientation})}});let l={head:{position:i,orientation:s},controllers:c};try{inputChannel&&"open"===inputChannel.readyState?(inputChannel.send(JSON.stringify(l)),console.log("Data sent:",JSON.stringify(l)),showSnackbar("Tracking data sent.")):(console.log("Input channel not open or not available"),showSnackbar("Tracking data not sent: channel unavailable.")),trackingDataSpan?(trackingDataSpan.textContent=JSON.stringify(l,null,2),showSnackbar("Tracking data updated in UI.")):(console.warn('Element with id "tracking-data" not found'),showSnackbar("Could not update tracking data in UI."))}catch(d){console.error("Error in tracking:",d),showSnackbar("Error in tracking: "+d.message)}}else console.log("No viewer pose available for this frame"),showSnackbar("No tracking data available for this frame.");renderer.render(scene,camera),n.requestAnimationFrame(o)}renderer.xr.setReferenceSpaceType("local"),renderer.xr.setSession(n),animate(),n.requestAnimationFrame(o)}catch(r){console.error("Failed to enter VR session:",r),vrButton.textContent="Enter VR",vrButton.onclick=enterVR,showSnackbar("Failed to enter VR: "+r.message)}else console.warn("WebXR API is not supported in this browser."),showSnackbar("WebXR is not supported in this browser.")}function exitVR(){renderer.xr.getSession()&&renderer.xr.getSession().end().then(()=>{console.log("VR session ended")}),container.style.display="none",remoteVideo.style.display="block",vrButton.textContent="Enter VR",vrButton.onclick=enterVR}confirmLoginButton.onclick=login,spawnButton.onclick=start,vrButton.onclick=enterVR,loginButton.onclick=openLoginModal,passwordInput.addEventListener("keydown",function(e){"Enter"===e.key&&login()}),function(e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define([],e):("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this).EventEmitter3=e()}(function(){return(function e(n,t,o){function r(i,s){if(!t[i]){if(!n[i]){var c="function"==typeof require&&require;if(!s&&c)return c(i,!0);if(a)return a(i,!0);var l=Error("Cannot find module '"+i+"'");throw l.code="MODULE_NOT_FOUND",l}var d=t[i]={exports:{}};n[i][0].call(d.exports,function(e){return r(n[i][1][e]||e)},d,d.exports,e,n,t,o)}return t[i].exports}for(var a="function"==typeof require&&require,i=0;i<o.length;i++)r(o[i]);return r})({1:[function(e,n,t){"use strict";var o=Object.prototype.hasOwnProperty,r="~";function a(){}function i(e,n,t){this.fn=e,this.context=n,this.once=t||!1}function s(e,n,t,o,a){if("function"!=typeof t)throw TypeError("The listener must be a function");var s=new i(t,o||e,a),c=r?r+n:n;return e._events[c]?e._events[c].fn?e._events[c]=[e._events[c],s]:e._events[c].push(s):(e._events[c]=s,e._eventsCount++),e}function c(e,n){0==--e._eventsCount?e._events=new a:delete e._events[n]}function l(){this._events=new a,this._eventsCount=0}Object.create&&(a.prototype=Object.create(null),(new a).__proto__||(r=!1)),l.prototype.eventNames=function(){var e,n,t=[];if(0===this._eventsCount)return t;for(n in e=this._events)o.call(e,n)&&t.push(r?n.slice(1):n);return Object.getOwnPropertySymbols?t.concat(Object.getOwnPropertySymbols(e)):t},l.prototype.listeners=function(e){var n=r?r+e:e,t=this._events[n];if(!t)return[];if(t.fn)return[t.fn];for(var o=0,a=t.length,i=Array(a);o<a;o++)i[o]=t[o].fn;return i},l.prototype.listenerCount=function(e){var n=r?r+e:e,t=this._events[n];return t?t.fn?1:t.length:0},l.prototype.emit=function(e,n,t,o,a,i){var s=r?r+e:e;if(!this._events[s])return!1;var c,l=this._events[s],d=arguments.length;if(l.fn){switch(l.once&&this.removeListener(e,l.fn,void 0,!0),d){case 1:return l.fn.call(l.context),!0;case 2:return l.fn.call(l.context,n),!0;case 3:return l.fn.call(l.context,n,t),!0;case 4:return l.fn.call(l.context,n,t,o),!0;case 5:return l.fn.call(l.context,n,t,o,a),!0;case 6:return l.fn.call(l.context,n,t,o,a,i),!0}for(m=1,c=Array(d-1);m<d;m++)c[m-1]=arguments[m];l.fn.apply(l.context,c)}else for(var u,p=l.length,m=0;m<p;m++)switch(l[m].once&&this.removeListener(e,l[m].fn,void 0,!0),d){case 1:l[m].fn.call(l[m].context);break;case 2:l[m].fn.call(l[m].context,n);break;case 3:l[m].fn.call(l[m].context,n,t);break;case 4:l[m].fn.call(l[m].context,n,t,o);break;default:if(!c)for(u=1,c=Array(d-1);u<d;u++)c[u-1]=arguments[u];l[m].fn.apply(l[m].context,c)}return!0},l.prototype.on=function(e,n,t){return s(this,e,n,t,!1)},l.prototype.once=function(e,n,t){return s(this,e,n,t,!0)},l.prototype.removeListener=function(e,n,t,o){var a=r?r+e:e;if(!this._events[a])return this;if(!n)return c(this,a),this;var i=this._events[a];if(i.fn)i.fn!==n||o&&!i.once||t&&i.context!==t||c(this,a);else{for(var s=0,l=[],d=i.length;s<d;s++)(i[s].fn!==n||o&&!i[s].once||t&&i[s].context!==t)&&l.push(i[s]);l.length?this._events[a]=1===l.length?l[0]:l:c(this,a)}return this},l.prototype.removeAllListeners=function(e){var n;return e?(n=r?r+e:e,this._events[n]&&c(this,n)):(this._events=new a,this._eventsCount=0),this},l.prototype.off=l.prototype.removeListener,l.prototype.addListener=l.prototype.on,l.prefixed=r,l.EventEmitter=l,void 0!==n&&(n.exports=l)},{}]},{},[1])(1)});