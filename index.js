let username;
let password;
let robotUsername;

const loginButton = document.getElementById('login-button');
const spawnButton = document.getElementById('spawnButton');
const vrButton = document.getElementById('vrButton');
const confirmLoginButton = document.getElementById('confirm-login-button');
const remoteVideo = document.getElementById('remoteVideo');
const enteredpw = document.getElementById("private-password-input");
const submitPwBtn = document.getElementById("submit-password-button");
const snackbar = document.getElementById('snackbar');
const modalLogin = document.getElementById("modal-login");
const closeLoginSpan = document.getElementById("close-login-modal");
const usernameInput = document.getElementById("username-input");
const passwordInput = document.getElementById("password-input");
const robotUsernameInput = document.getElementById("robot-username-input");
const modalPassword = document.getElementById("modal-enter-password");
const pwModalSpan = document.getElementById("close-password-modal");
const loadingOverlay = document.getElementById('loadingOverlay');
const trackingDataSpan = document.getElementById('tracking-data');
const container = document.getElementById('vr-container');

let remoteStream;
let peerConnection;
let configuration;
let connectionTimeout;
let tokenrate;
let signalingSocket;
let inputChannel;
let responseHandlers = {};
let emitter;
let attemptCount = 0;
let tempPW = "";
const maxReconnectAttempts = 20;
let reconnectAttempts = 0;
const reconnectDelay = 2000;
let isGuest = true;
const wsUrl = 'https://sp4wn-signaling-server.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    let robotCookie = getCookie('robotusername');
    if (robotCookie) {
        robotUsernameInput.value = decodeURIComponent(robotCookie);
    }
    emitter = new EventEmitter3();
    login();
});

function getCookie(name) {
    let value = "; " + document.cookie;
    let parts = value.split("; " + name + "=");
    if (parts.length == 2) return parts.pop().split(";").shift();
}

function openLoginModal() {
    modalLogin.style.display = "block";
}

function login() {
    console.log("Logging in...");
    username = usernameInput.value.toLowerCase();
    password = passwordInput.value;

    if (!username || !password) {
        isGuest = true;
    } else {
        isGuest = false;
    }
    
    connectToSignalingServer();
}

async function connectToSignalingServer() {
    console.log('Connecting to signaling server...');

    return new Promise((resolve, reject) => {
        signalingSocket = new WebSocket(wsUrl);

        connectionTimeout = setTimeout(() => {
            try {
                signalingSocket.close();
            } catch (error) {
                console.log(error);
            }
            reject(new Error('Connection timed out'));
        }, 10000);

        signalingSocket.onopen = () => {
            clearTimeout(connectionTimeout);
            reconnectAttempts = 0;
            if (isGuest) {
                send({
                    type: "wslogin",
                    guest: true
                });
            } else {
                send({
                    type: "wslogin",
                    username: username,
                    password: password
                });
            }
            resolve();
        };

        signalingSocket.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            emitter.emit(message.type, message);
            
            if (responseHandlers[message.type]) {
                responseHandlers[message.type](message);
                delete responseHandlers[message.type];
            } else {
                await handleSignalingData(message, resolve);
            }
        };

        signalingSocket.onclose = () => {
            clearTimeout(connectionTimeout);
            console.log('Disconnected from signaling server');
            handleReconnect();
        };

        signalingSocket.onerror = (error) => {
            clearTimeout(connectionTimeout);
            console.error('WebSocket error:', error);
            reject(error);
        };
    });
}

function send(message) {
    signalingSocket.send(JSON.stringify(message));
};

function handleReconnect() {
    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = reconnectDelay * reconnectAttempts; 
        console.log(`Reconnecting in ${delay / 1000} seconds... (Attempt ${reconnectAttempts})`);
        setTimeout(connectToSignalingServer, delay);
    } else {
        console.log('Max reconnect attempts reached. Please refresh the page.');
    }
}

async function handleSignalingData(message, resolve) {
    switch (message.type) {
        case "authenticated":
            handleLogin(message.success, message.configuration, message.errormessage, message.username );
            resolve();
            break;

        case 'offer':
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                send({ type: 'answer', answer, username: username, host: robotUsername });
            } else {
                console.log("no answer peer connection");
            }
            break;

        case 'answer':
            if (peerConnection) {
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
                } catch (error) {
                    console.error("Error when setting remote description: ", error);
                }
            } else {
                console.log("no answer peer connection");
            }
            break;

        case "watch":
            watchStream(message.name, message.pw);
            break;

        case "endStream":
            endStream();
            break;
        
    }
}

function handleLogin(success, config, errormessage, name) {
    if (!success) {
        if (errormessage == "User is already logged in") {
            setTimeout(() => {
                send({
                    type: "wslogin",
                    username: username,
                    password: password,
                });
                console.log("Retrying login in 10 seconds");
                showSnackbar("Retrying login in 10 seconds");
            }, 10000);
        } else {
            console.log("Invalid login", errormessage);
            showSnackbar("Invalid login", errormessage);
        }
    } else if (success) {
        console.log("Successfully logged in");
        modalLogin.style.display = "none";
        configuration = config;
        username = name;
        console.log(username);

        if (!isGuest) {
            loginButton.style.display = "none";
        }
    }
}

pwModalSpan.onclick = function() {
    modalPassword.style.display = "none";
}

closeLoginSpan.onclick = function() {
    modalLogin.style.display = "none";
}

submitPwBtn.onclick = async function() {
    if (enteredpw.value === "") {
        showSnackbar("Please enter a password");
        console.log("Please enter a password");
        return;
    }
    if (robotUsername === "") {
        showSnackbar("Update robotUsername");
        console.log("Update robotUsername");
        return;
    }
    submitPwBtn.disabled = true;
    submitPwBtn.classList.add('disabled');
    let pw = enteredpw.value;
    tempPW = pw;
    try {
        const isValid = await verifyPassword(robotUsername, pw);
        if (isValid) {
            modalPassword.style.display = "none";
            initSpawn();
            attemptCount = 0;
        } else {
            attemptCount++;
            showSnackbar("Failed to authenticate password");
        }
    } catch (error) {
        attemptCount++;
        showSnackbar("Error verifying password");
        console.log("Error verifying password:", error);
    }

    if (attemptCount >= 3) {
        setTimeout(() => {
            submitPwBtn.disabled = false;
            submitPwBtn.classList.remove('disabled');
        }, 5000);
    } else {
        submitPwBtn.disabled = false;
        submitPwBtn.classList.remove('disabled');
    }
};

async function initSpawn() {
    if (tokenrate > 0) {
        const balance = await checkTokenBalance(username);
        if (!balance) {
            showSnackbar(`Not enough tokens. Rate: ${tokenrate}`);
            spawnButton.disabled = false; 
            return;
        }
    } 
    
    if (tokenrate < 0 ) {
        const isBalanceAvailable = checkTokenBalance(robotUsername)
        if(!isBalanceAvailable) {
            showSnackbar(`Host doesn't have enough tokens. Rate: ${(Number(tokenrate) / 10 ** 6).toFixed(2)} tokens/min`);
            spawnButton.disabled = false; 
            return;
        }
    }
    await openPeerConnection();
    await startStream();
}

async function startStream() {
    console.log("starting stream");
    try {
        const VRSuccess = await handleVROnConnection();
        if (VRSuccess) {
            console.log("VR loaded");
            
            // Check ICE connection status before waiting for data channels to open
            console.log("Checking ICE connection status...");
            const isConnected = await checkICEStatus('connected');
            if (isConnected) {
                console.log("ICE connected. Now waiting for data channels to open...");
                
                if (await waitForChannelsToOpen()) {
                    console.log("Data channels are open. Proceeding with video confirmation...");
                    const isStreamReceivingData = await isStreamLive();
                    if (isStreamReceivingData) {
                        console.log("Stream is receiving data. Attempting token redemption...");
                        removeVideoOverlayListeners();
                        const redeemSuccess = await startAutoRedeem(tokenrate);
                        if (!redeemSuccess) {
                            console.error('Token redemption failed.');
                        } else {
                            console.log("Successfully started stream");
                            vrButton.style.display = "inline-block";
                            spawnButton.textContent = "End";
                            spawnButton.onclick = endStream;
                        }
                    } else {
                        throw new Error('Stream is not live.');
                    }
                } else {
                    throw new Error('Failed to open data channels.');
                }
            } else {
                throw new Error('ICE connection failed.');
            }
        } else {
            throw new Error('VR failed to load.');
        }
    } catch (error) {
        showSnackbar("Failed to start stream");
        console.error(`Error: ${error.message}`);
        hideLoadingOverlay();
        endStream();
        spawnButton.disabled = false;
    }
    spawnButton.disabled = false;
}

function checkTokenBalance(name) {
    return new Promise((resolve, reject) => {
        checkUserTokenBalance({
            type: "checkTokenBalance",
            username: name,
            tokenrate: tokenrate
        }).then(response => {
            if (response.success) {
                resolve(true);
            } else {
                reject(new Error("Balance check failed"));
            }
        }).catch(error => {
            reject(error);
        });
    });
}

function checkUserTokenBalance(message) {
    return new Promise((resolve, reject) => {
        signalingSocket.send(JSON.stringify(message), (error) => {
            if (error) {
                reject(error);
            }
        });
    
        emitter.once('balanceChecked', (response) => {
            try {
                resolve(response);
            } catch (error) {
                reject(error);
            }
        });
    });
 }

function verifyPassword(username, pw) {
    return new Promise((resolve, reject) => {
        sendPW({
            type: "checkPassword",
            username: username,
            password: pw
        }).then(response => {
            if (response.success) {
                resolve(true);
            } else {
                reject(new Error("Password verification failed"));
            }
        }).catch(error => {
            reject(error);
        });
    });
}

async function authenticateCode(pw) {
    try {
        if (pw === secretCode) {
            return { success: true };
        } else {
            return { success: false };
        }
    } catch (error) {
        console.log("Failed to authenticate password:", error);
        return { success: false };
    }
}

function sendPW(message) {
    return new Promise((resolve, reject) => {
        responseHandlers["authbotpw"] = (response) => {
            try {
                resolve(response);
            } catch (error) {
                reject(error);
            }
        };
        signalingSocket.send(JSON.stringify(message), (error) => {
            if (error) {
               reject(error);
               return;
            }
         });
    });
}

function createOffer() {
    return new Promise((resolve, reject) => {
        peerConnection.createOffer()
            .then(offer => {
                return peerConnection.setLocalDescription(offer)
                .then(() => offer);
             })
            .then(offer => {               
                send({
                   type: "offer",
                   offer: offer,
                   username: username,
                   host: robotUsername
                });
                resolve();
            })
            .catch(err => reject(err));
    });
}

async function start() {
    robotUsername = robotUsernameInput.value;
    document.cookie = `robotusername=${encodeURIComponent(robotUsername)}; max-age=31536000; path=/`;
    if (!robotUsername) {
        showSnackbar("Please enter the robot's username");
        return;
    }
    spawnButton.disabled = true;
    try {
        const response = await fetch(`${wsUrl}/fetch-robot-details?username=${encodeURIComponent(robotUsername)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error fetching profile`);
        }

        const result = await response.json();
        if (!result.isLive) {
            showSnackbar("Robot isn't available");
            spawnButton.disabled = false;
            return;
        }
        tokenrate = Number(result.tokenrate);
        if (result.isPrivate) {
            modalPassword.style.display = "block";
        } else {
            initSpawn();
        }
    } catch (error) {
        console.error("Error checking robot status:", error);
        spawnButton.disabled = false;
    }
}

async function openPeerConnection() {
    if (peerConnection && (peerConnection.connectionState !== 'closed' || peerConnection.signalingState !== 'closed')) {
       console.log("An existing PeerConnection is open. Closing it first.");
        peerConnection.close();
        peerConnection = null;
    }
 
    await closeDataChannels();
    peerConnection = new RTCPeerConnection(configuration);
    remoteStream = new MediaStream();
    remoteVideo.srcObject = remoteStream;
    
    peerConnection.ontrack = (event) => {
        remoteStream.addTrack(event.track);
        console.log("Received track:", event.track);
    };

    peerConnection.onicecandidate = function (event) {
        console.log("Received ice candidate");
        if (event.candidate) {
            send({
                type: "candidate",
                candidate: event.candidate,
                othername: robotUsername          
            });
        }
    };  
 
    send({
        type: "watch",
        username: username,
        host: robotUsername,
        pw: tempPW
    });
}

async function closeDataChannels() {
    return new Promise((resolve) => {
        if (peerConnection) {
            if (inputChannel && inputChannel.readyState === 'open') {
                inputChannel.close();
                inputChannel = null;
                console.log("Closed input channel.");
            }
            console.log("Closed data channels");
            resolve();  
        } else {
            resolve();
        }
    });
}

async function checkICEStatus(status) {
    console.log("Checking ICE status");
  
    if (!peerConnection) {
        console.error('No peer connection available');
        return Promise.resolve(false);
    }
  
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 5;
        const interval = 2000;
    
        const intervalId = setInterval(() => {
            try {
                console.log('ICE Connection State:', peerConnection.iceConnectionState);
            
                if (peerConnection.iceConnectionState === status || peerConnection.iceConnectionState === 'completed') {
                    clearInterval(intervalId);
                    console.log('ICE connection established.');
                    resolve(true);
                } else if (attempts >= maxAttempts) {
                    clearInterval(intervalId);
                    console.error('ICE connection not established within the expected time.');
                    reject(new Error('ICE connection not established within the expected time.'));
                } else {
                    attempts++;
                }
            } catch (error) {
                clearInterval(intervalId);
                console.error('An error occurred:', error);
                reject(error);
            }
        }, interval);
    });
}
 
async function handleVROnConnection() {
    return new Promise((resolve, reject) => {
        try {
            initializeVideoOverlay();
            setTimeout(() => {
                resolve(true);
            }, 200);
        } catch (error) {
            console.error("Error in handleVROnConnection:", error);
            reject(false);
        }
    });
}

function waitForChannelsToOpen() {
    return new Promise(async (resolve) => {
        try {
            const success = await setupDataChannelListenerWithTimeout();
            resolve(success);
        } catch (error) {
            console.error("Error opening channels:", error);
            resolve(false);
        }
    });
}

function setupDataChannelListenerWithTimeout() {
    return new Promise((resolve, reject) => {
        let channelsOpen = 0;
        const requiredChannels = 1;
        const timeoutDuration = 15000;
        let timeoutId;

        peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            const type = channel.label;

            console.log(`Data channel of type "${type}" received.`);

            switch (type) {
                case "input":
                    handleInputChannel(channel, incrementChannelCounter);
                    break;
                default:
                    console.warn(`Unknown data channel type: ${type}`);
                    if (timeoutId) clearTimeout(timeoutId); 
                    reject(new Error(`Unsupported data channel type: ${type}`));
                    return;
            }
        };

        function incrementChannelCounter() {
            channelsOpen++;
            if (channelsOpen === requiredChannels) {
                if (timeoutId) clearTimeout(timeoutId); 
                resolve(true);
            }
        }

        timeoutId = setTimeout(() => {
            reject(new Error(`Timeout: Data channels did not open within ${timeoutDuration} ms`));
        }, timeoutDuration);
    });
}

function handleInputChannel(channel, incrementChannelCounter) {
    inputChannel = channel;
 
    inputChannel.onopen = () => {
        incrementChannelCounter();
    };
 
    inputChannel.onmessage = (event) => {
       console.log("Received input channel message:", event.data);
 
    };
 
    inputChannel.onclose = () => {
        console.log("Input channel has been closed");
        exitVR();
        endStream();
    };
 
    inputChannel.onerror = (error) => {
        console.error("Input channel error:", error);
    };
}

async function isStreamLive() {
    return new Promise((resolve, reject) => {
        if (remoteStream && remoteStream.getTracks().some(track => track.readyState === 'live')) {
            resolve(true);
        } else {
            const checkIfLive = () => {
                if (remoteStream && remoteStream.getTracks().some(track => track.readyState === 'live')) {
                    resolve(true);
                    clearInterval(liveCheckInterval);
                }
            };
 
            const liveCheckInterval = setInterval(() => {
                checkIfLive();
            }, 1000);
 
            setTimeout(() => {
                clearInterval(liveCheckInterval);
                reject(new Error("Stream is not live."));
            }, 1000);
        }
    });
}

async function startAutoRedeem() {
    return new Promise((resolve, reject) => {
        let userDetails = {
            hostname: robotUsername,
            username: username,
            tokens: tokenrate
        };
        
        if (isGuest) {
            userDetails = {
                ...userDetails,
                guest: true
            };
        }

        fetch(`${wsUrl}/redeem`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userDetails) 
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                console.log('Auto-redemption initiated on the server.');
                resolve(true);
            } else {
                reject(new Error(data.error || 'Redemption failed'));
            }
        })
        .catch(error => {
            console.error('Error initiating auto-redemption:', error);
            reject(error);
        });
    });
}

async function stopAutoRedeem() {
    try {
        const requestBody = {
            userUsername: username,
            hostUsername: robotUsername
        };

        if (isGuest) {
            requestBody.guest = true;
        }

        const response = await fetch(`${wsUrl}/stopAutoRedeem`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (data.success) {
            console.log(data.message);
            return true; 
        } else {
            console.error('Failed to stop auto-redemption:', data.error);
            return false; 
        }
    } catch (error) {
        console.error('Error stopping auto-redemption:', error);
        return false; 
    }
}

async function endStream() {
    console.log("Ending stream");
    stopAutoRedeem();
    spawnButton.textContent = "Spawn";
    spawnButton.onclick = start;
    vrButton.style.display = "none";
    remoteVideo.srcObject = null;
    await closeDataChannels();
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
}

function showSnackbar(message) {
    try {
        snackbar.textContent = message;
        snackbar.className = 'snackbar show';
 
        setTimeout(function() {
            snackbar.className = snackbar.className.replace('show', '');
        }, 5000);
    } catch (error) {
        console.error('Error showing snackbar:', error);
    }
}

function initializeVideoOverlay() {
    showLoadingOverlay();
}
  
function removeVideoOverlayListeners() {
    hideLoadingOverlay();
}
  
function showLoadingOverlay() {
    loadingOverlay.style.display = 'flex';
}
  
function hideLoadingOverlay() {
    loadingOverlay.style.display = 'none';
}

let scene, camera, renderer, xrSession, referenceSpace, videoMesh;

async function setupScene() {
    container.style.display = "block";
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 1);

    if (remoteVideo.srcObject) { 
        console.log('Video source found');
        remoteVideo.style.display = "none";
        const videoTexture = new THREE.VideoTexture(remoteVideo);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        videoTexture.format = THREE.RGBAFormat;

        const videoMaterial = new THREE.MeshBasicMaterial({ 
            map: videoTexture, 
            side: THREE.FrontSide
        });

        const videoAspectRatio = remoteVideo.videoWidth / remoteVideo.videoHeight;
        const rendererAspectRatio = window.innerWidth / window.innerHeight;

        let planeWidth, planeHeight;
        if (videoAspectRatio > rendererAspectRatio) {
            planeWidth = 2;
            planeHeight = planeWidth / videoAspectRatio;
        } else {
            planeHeight = 2; 
            planeWidth = planeHeight * videoAspectRatio;
        }
        const videoGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        videoMesh = new THREE.Mesh(videoGeometry, videoMaterial);
        videoMesh.position.set(0, 0, -2);
        scene.add(videoMesh);
        camera.lookAt(videoMesh.position);
        camera.aspect = rendererAspectRatio;
        camera.updateProjectionMatrix();
        remoteVideo.loop = true;
        remoteVideo.play();

        console.log('Video should now be playing on the plane');
    } else {
        console.warn('No video stream is set for remoteVideo');
    }
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
}

function updateVideomeshPosition(camera, videomesh) {
    const offset = new THREE.Vector3(0, 0, -2);
    offset.applyQuaternion(camera.quaternion);
    videomesh.position.copy(camera.position).add(offset);
    videomesh.quaternion.copy(camera.quaternion);
}

function animate() {
    if (renderer.xr.isPresenting) {
        renderer.setAnimationLoop(() => {
            renderer.render(scene, camera);
        });
    } else {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
}

async function enterVR() {
    await setupScene(); 
    vrButton.textContent = "Exit VR";
    vrButton.onclick = exitVR;

    if (navigator.xr) {
        try {
            const gl = renderer.getContext();
            await gl.makeXRCompatible();
            const session = await navigator.xr.requestSession('immersive-vr');
            console.log('Session requested successfully', session);
            renderer.xr.enabled = true;
            renderer.setPixelRatio(window.devicePixelRatio);

            session.updateRenderState({
                baseLayer: new XRWebGLLayer(session, renderer.getContext())
            });

            const referenceSpace = await session.requestReferenceSpace('local');
            renderer.xr.setReferenceSpaceType('local');
            renderer.xr.setSession(session);

            animate();

            function onAnimationFrame(time, frame) {
                const viewerPose = frame.getViewerPose(referenceSpace);
                if (viewerPose) {
                    const headPosition = viewerPose.transform.position;
                    const headOrientation = viewerPose.transform.orientation;
            
                    updateVideomeshPosition(camera, videoMesh);
            
                    let controllerData = [];
                    frame.session.inputSources.forEach((inputSource) => {
                        if (inputSource.gripSpace) {
                            const gripPose = frame.getPose(inputSource.gripSpace, referenceSpace);
                            if (gripPose) {
                                controllerData.push({
                                    gripPosition: gripPose.transform.position,
                                    gripOrientation: gripPose.transform.orientation
                                });
                            }
                        }
                        if (inputSource.targetRaySpace) {
                            const targetPose = frame.getPose(inputSource.targetRaySpace, referenceSpace);
                            if (targetPose) {
                                controllerData.push({
                                    targetPosition: targetPose.transform.position,
                                    targetOrientation: targetPose.transform.orientation
                                });
                            }
                        }
                    });
            
                    const trackingData = {
                        head: {
                            position: headPosition,
                            orientation: headOrientation
                        },
                        controllers: controllerData
                    };
            
                    try {
                        if (inputChannel && inputChannel.readyState === 'open') {
                            inputChannel.send(JSON.stringify(trackingData));
                            console.log('Data sent:', JSON.stringify(trackingData));
                            showSnackbar('Tracking data sent.');
                        } else {
                            console.log('Input channel not open or not available');
                            showSnackbar('Tracking data not sent: channel unavailable.');
                        }
            
                        if (trackingDataSpan) {
                            trackingDataSpan.textContent = JSON.stringify(trackingData, null, 2); 
                            showSnackbar('Tracking data updated in UI.');
                        } else {
                            console.warn('Element with id "tracking-data" not found');
                            showSnackbar('Could not update tracking data in UI.');
                        }
                    } catch (error) {
                        console.error('Error in tracking:', error);
                        showSnackbar('Error in tracking: ' + error.message);
                    }
                } else {
                    console.log('No viewer pose available for this frame');
                    showSnackbar('No tracking data available for this frame.');
                }
            
                renderer.render(scene, camera);
                session.requestAnimationFrame(onAnimationFrame);
            }
            
            session.requestAnimationFrame(onAnimationFrame);

        } catch (error) {
            console.error('Failed to enter VR session:', error);
            vrButton.textContent = "Enter VR";
            vrButton.onclick = enterVR;
            showSnackbar('Failed to enter VR: ' + error.message);
        }
    } else {
        console.warn('WebXR API is not supported in this browser.');
        showSnackbar('WebXR is not supported in this browser.');
    }
}

function exitVR() {
    if (renderer.xr.getSession()) {
        renderer.xr.getSession().end().then(() => {
            console.log('VR session ended');
        });
    }
    container.style.display = "none";
    remoteVideo.style.display = "block";
    vrButton.textContent = "Enter VR";
    vrButton.onclick = enterVR;
}

confirmLoginButton.onclick = login;
spawnButton.onclick = start;
vrButton.onclick = enterVR;
loginButton.onclick = openLoginModal;

passwordInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        login();
    }
});

//Event Emitter 3
!function(e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define([],e):("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this).EventEmitter3=e()}(function(){return function i(s,f,c){function u(t,e){if(!f[t]){if(!s[t]){var n="function"==typeof require&&require;if(!e&&n)return n(t,!0);if(a)return a(t,!0);var r=new Error("Cannot find module '"+t+"'");throw r.code="MODULE_NOT_FOUND",r}var o=f[t]={exports:{}};s[t][0].call(o.exports,function(e){return u(s[t][1][e]||e)},o,o.exports,i,s,f,c)}return f[t].exports}for(var a="function"==typeof require&&require,e=0;e<c.length;e++)u(c[e]);return u}({1:[function(e,t,n){"use strict";var r=Object.prototype.hasOwnProperty,v="~";function o(){}function f(e,t,n){this.fn=e,this.context=t,this.once=n||!1}function i(e,t,n,r,o){if("function"!=typeof n)throw new TypeError("The listener must be a function");var i=new f(n,r||e,o),s=v?v+t:t;return e._events[s]?e._events[s].fn?e._events[s]=[e._events[s],i]:e._events[s].push(i):(e._events[s]=i,e._eventsCount++),e}function u(e,t){0==--e._eventsCount?e._events=new o:delete e._events[t]}function s(){this._events=new o,this._eventsCount=0}Object.create&&(o.prototype=Object.create(null),(new o).__proto__||(v=!1)),s.prototype.eventNames=function(){var e,t,n=[];if(0===this._eventsCount)return n;for(t in e=this._events)r.call(e,t)&&n.push(v?t.slice(1):t);return Object.getOwnPropertySymbols?n.concat(Object.getOwnPropertySymbols(e)):n},s.prototype.listeners=function(e){var t=v?v+e:e,n=this._events[t];if(!n)return[];if(n.fn)return[n.fn];for(var r=0,o=n.length,i=new Array(o);r<o;r++)i[r]=n[r].fn;return i},s.prototype.listenerCount=function(e){var t=v?v+e:e,n=this._events[t];return n?n.fn?1:n.length:0},s.prototype.emit=function(e,t,n,r,o,i){var s=v?v+e:e;if(!this._events[s])return!1;var f,c=this._events[s],u=arguments.length;if(c.fn){switch(c.once&&this.removeListener(e,c.fn,void 0,!0),u){case 1:return c.fn.call(c.context),!0;case 2:return c.fn.call(c.context,t),!0;case 3:return c.fn.call(c.context,t,n),!0;case 4:return c.fn.call(c.context,t,n,r),!0;case 5:return c.fn.call(c.context,t,n,r,o),!0;case 6:return c.fn.call(c.context,t,n,r,o,i),!0}for(p=1,f=new Array(u-1);p<u;p++)f[p-1]=arguments[p];c.fn.apply(c.context,f)}else for(var a,l=c.length,p=0;p<l;p++)switch(c[p].once&&this.removeListener(e,c[p].fn,void 0,!0),u){case 1:c[p].fn.call(c[p].context);break;case 2:c[p].fn.call(c[p].context,t);break;case 3:c[p].fn.call(c[p].context,t,n);break;case 4:c[p].fn.call(c[p].context,t,n,r);break;default:if(!f)for(a=1,f=new Array(u-1);a<u;a++)f[a-1]=arguments[a];c[p].fn.apply(c[p].context,f)}return!0},s.prototype.on=function(e,t,n){return i(this,e,t,n,!1)},s.prototype.once=function(e,t,n){return i(this,e,t,n,!0)},s.prototype.removeListener=function(e,t,n,r){var o=v?v+e:e;if(!this._events[o])return this;if(!t)return u(this,o),this;var i=this._events[o];if(i.fn)i.fn!==t||r&&!i.once||n&&i.context!==n||u(this,o);else{for(var s=0,f=[],c=i.length;s<c;s++)(i[s].fn!==t||r&&!i[s].once||n&&i[s].context!==n)&&f.push(i[s]);f.length?this._events[o]=1===f.length?f[0]:f:u(this,o)}return this},s.prototype.removeAllListeners=function(e){var t;return e?(t=v?v+e:e,this._events[t]&&u(this,t)):(this._events=new o,this._eventsCount=0),this},s.prototype.off=s.prototype.removeListener,s.prototype.addListener=s.prototype.on,s.prefixed=v,s.EventEmitter=s,void 0!==t&&(t.exports=s)},{}]},{},[1])(1)});