import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
const DQuestions = () => {
  const location = useLocation();

  const userDetails = location.state;

  const navigate = useNavigate();
  const [isTabActive,setIsTabActive] = useState(true);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [userAnswers, setUserAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const duration = 0.5 * 60 * 1000; // 2 minutes
  const targetDateRef = useRef(new Date().getTime() + duration);
  const [timeLeft, setTimeLeft] = useState(duration);
  const intervalRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const brightnessCanvasRef = useRef(document.createElement('canvas'));
  const [mediaStream, setMediaStream] = useState(null);
  const audioContextRef = useRef(null);
  const micCheckTimeoutRef = useRef(null);
  const analyserRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceCounterRef = useRef(0);
  const whisperCounterRef = useRef(0);
  const hasWarnedRef = useRef(false);
  const [micStatus, setMicStatus] = useState('');
  const [faceStatus, setFaceStatus] = useState('');
const [autoSubmitTriggered, setAutoSubmitTriggered] = useState(false);
const [showSpinner,setShowSpinner] = useState(false);
const [showModal,setShowModal] = useState(false);
const [count,setCount] = useState(0);

 useEffect(() => {
  intervalRef.current = setInterval(() => {
    const now = new Date().getTime();
    const remaining = targetDateRef.current - now;

    if (remaining <= 0) {
      clearInterval(intervalRef.current);
      setTimeLeft(0);
      alert("⏰ Time up! Submitting your answers.");
      setSubmitted(true); 
      // storeResult(); 
       setAutoSubmitTriggered(true);    

    } else {
      setTimeLeft(remaining);
    }
  }, 1000);

  return () => clearInterval(intervalRef.current);
}, []);
useEffect(() => {
  if (autoSubmitTriggered && quizQuestions.length > 0) {
    storeResult();
    setAutoSubmitTriggered(false); // reset
  }
}, [autoSubmitTriggered, quizQuestions]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri('/models/ssd_mobilenetv1');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models/face_landmark_68');
        // console.log("Face-api models loaded");
      } catch (err) {
        console.error("Error loading face-api models:", err);
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    startMonitoring();
  }, []);


    useEffect(() => {
    const handleWindowChange = () => {
      setIsTabActive(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleWindowChange);

    return () => {
      document.removeEventListener('visibilitychange', handleWindowChange);
    };
  }, []);

  useEffect(() => {
    if (!isTabActive) {
      alert("Logging out of exam...");
      storeResult();
       setTimeout(() => {
        navigate('/');
      }, 3000);
 
    } else {
      console.log("Tab is active");
    }
  }, [isTabActive]);

  const getAverageBrightness = (video) => {
    try {
      const canvas = brightnessCanvasRef.current;
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += brightness;
      }
      return sum / (canvas.width * canvas.height);
    } catch (err) {
      console.error("Brightness calculation error:", err);
      return null;
    }
  };

  const startMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setMediaStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().then(() => {
            const brightness = getAverageBrightness(videoRef.current);
            if (brightness < 30) {
              setFaceStatus("⚠️ Lighting too low. Please improve room light.");
            }
          });
        };
      }

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') await audioContext.resume();

      const micSource = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      micSource.connect(analyser);

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.onresult = (event) => {
          const transcript = event.results[event.results.length - 1][0].transcript;
          setMicStatus(`Speech detected: ${transcript}`);
        };
        recognition.onerror = () => setMicStatus("Speech recognition error.");
        recognition.onend = () => recognition.start();
        recognitionRef.current = recognition;
        recognition.start();
      } else {
        setMicStatus("Speech recognition not supported.");
      }
    } catch (err) {
      console.error("Webcam/Mic error:", err);
      setMicStatus("Please allow camera and microphone access.");
    }
  };

  const checkMicSilence = () => {
    try {
      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      const speechBins = dataArray.slice(0, 12);
      const avg = speechBins.reduce((a, b) => a + b, 0) / speechBins.length;

      if (avg > 25) {
        silenceCounterRef.current = 0;
        whisperCounterRef.current = 0;
        if (!micStatus.includes("Speech detected")) {
          setMicStatus("Voice detected");
        }
      } else if (avg > 10 && avg <= 25) {
        whisperCounterRef.current++;
        silenceCounterRef.current = 0;
        setMicStatus("Possibly whispering");
        if (whisperCounterRef.current >= 2) {
          setMicStatus("Whispering detected!");
          whisperCounterRef.current = 0;
        }
        alert("Whispering detected!");
      } else {
        silenceCounterRef.current++;
        whisperCounterRef.current = 0;
        setMicStatus("Possibly silent");
        if (silenceCounterRef.current >= 2) {
          setMicStatus("No voice detected!");
          silenceCounterRef.current = 0;
        }
      }
    } catch (err) {
      setMicStatus("Mic analysis error.");
    }

    micCheckTimeoutRef.current = setTimeout(checkMicSilence, 500);
  };

  useEffect(() => {
    if (mediaStream && analyserRef.current) {
      checkMicSilence();
    }
    return () => clearTimeout(micCheckTimeoutRef.current);
  }, [mediaStream]);

  useEffect(() => {
    let intervalId;

    if (mediaStream) {
      intervalId = setInterval(async () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || video.readyState !== 4) return;

        const dims = { width: video.videoWidth, height: video.videoHeight };
        canvas.width = dims.width;
        canvas.height = dims.height;

        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);

        const brightness = getAverageBrightness(video);
        if (brightness < 30) {
          setFaceStatus("⚠️ Lighting too low. Please improve room light.");
          return;
        }

        const detections = await faceapi
          .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
          .withFaceLandmarks();

        if (detections.length > 0) {
          const resized = faceapi.resizeResults(detections, dims, true);
          faceapi.draw.drawDetections(canvas, resized);
          faceapi.draw.drawFaceLandmarks(canvas, resized);

          if (detections.length > 1) {
            setFaceStatus("⚠️ More than one face detected!");
            setCount((prevCount)=>prevCount+1);
          } else {
            const landmarks = detections[0].landmarks;
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();
            const nose = landmarks.getNose();

            const eyeCenterX = (leftEye[0].x + rightEye[3].x) / 2;
            const noseX = nose[3].x;
            const offset = noseX - eyeCenterX;

            if (offset > 10 && !hasWarnedRef.current) {
              setFaceStatus("⚠️ You're looking right. Face the camera.");
              hasWarnedRef.current = true;
            } else if (offset < -10 && !hasWarnedRef.current) {
              setFaceStatus("⚠️ You're looking left. Face the camera.");
              hasWarnedRef.current = true;
            } else if (Math.abs(offset) <= 10) {
              setFaceStatus("✅ Facing the camera");
              hasWarnedRef.current = false;
            }
          }
        } else {
          hasWarnedRef.current = false;
          setFaceStatus("⚠️ No face detected.");
        }
      }, 3000);
                  console.log("count errors",count)


      const handleVisibilityChange = () => {
        if (document.visibilityState !== 'visible') {
          setFaceStatus("⚠️ Exam window not in focus.");

        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        clearInterval(intervalId);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [mediaStream]);

  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  useEffect(() => {
    const stored = localStorage.getItem("questions");
    console.log("Stored questions:", stored); // Debug
    if (stored) {
      try {
        setQuizQuestions(JSON.parse(stored));
      } catch (err) {
        console.error("Error parsing questions:", err);
      }
    } else {
      // Fallback questions for testing
      setQuizQuestions([
        {
          question: "What is 2 + 2?",
          options: ["3", "4", "5"],
          correctAnswer: "4",
        },
      ]);
    }
  }, []);

  const handleAnswerChange = (qIndex, answer) => {
    setUserAnswers((prev) => ({ ...prev, [qIndex]: answer }));
  };


const handleSubmit = (e) => {

  e.preventDefault();
  clearInterval(intervalRef.current);
  storeResult();

  setShowSpinner(true);
  setShowModal(true);

  setTimeout(() => {
    setShowSpinner(false); 
    setShowModal(false); 
  
    setSubmitted(true);    
  }, 2000);
};
const handleLogout = ()=>{
  navigate('/');
}


const alert = ()=>{
   return(
    <p>your score:</p>
   )
}

const storeResult = ()=>{
   const score = getScore();
  //  console.log("score",score);
   const newEntry = {
    id: userDetails.id,
    score: score,
  };

  let existingData = JSON.parse(localStorage.getItem("Result")) || [];
  existingData.push(newEntry);
  localStorage.setItem("Result", JSON.stringify(existingData));
  // console.log("Result saved:", newEntry);

}

  const getScore = () => {
					
    let score = 0;
    // console.log("quizquestions",quizQuestions);
    quizQuestions.forEach((q, i) => {
      if (userAnswers[i] === q.correctAnswer) score += 1;
					
	 
    });
    return score;
  				   
					  
  };
  const styles = {
    wrapper: {
      width: "90%", 
      maxWidth: "1200px",
      margin: "30px auto",
      padding: "20px",
      backgroundColor: "#ffffff",
      borderRadius: "10px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      fontFamily: "'Segoe UI', sans-serif",
      boxSizing: "border-box",
    },
    header: {					 
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px",
						
											 
    },
    timer: {
      backgroundColor: timeLeft <= 6000 ? "#ffe6e6" : "#e3f2fd",
      color: timeLeft <= 6000 ? "#b71c1c" : "#0d47a1",
      fontWeight: "bold",
      fontSize: "16px",
      padding: "10px 16px",
      borderRadius: "8px",
    },
    cameraContainer: {
      position: 'relative',
      width: '150px', // Smaller size for header
      height: '100px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    },
    video: {
      width: '100%',
      height: '100%',
      border: '2px solid #ccc',
      borderRadius: '8px',
      objectFit: 'cover',
    },
    canvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    },
    statusText: {
      marginTop: '6px',
      color: '#333',
      fontWeight: 'bold',
      fontSize: '12px',
      textAlign: 'center',
    },
    questionCard: {
      padding: "20px",
      borderRadius: "10px",
      marginBottom: "20px",
         marginTop: "70px",
      backgroundColor: "#f9f9f9",
      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
      width: "100%", // Ensure question card takes full width
      boxSizing: "border-box",
    },
    questionText: {
      fontSize: "18px",
      fontWeight: "600",
      marginBottom: "15px",
    },
    option: {
      display: "block",
      marginBottom: "10px",
      fontSize: "16px",
    },
    submitBtn: {
      display: "block",
      margin: "30px auto 10px",
      backgroundColor: "#1c3681",
      color: "white",
      padding: "14px 36px",
      border: "none",
      borderRadius: "8px",
      fontSize: "16px",
      fontWeight: "bold",
      cursor: "pointer",
      boxShadow: "0 6px 12px rgba(0,0,0,0.2)",
    },
    scoreText: {
      textAlign: "center",
      fontSize: "22px",
      fontWeight: "bold",
      color: "#1c3681",
      marginTop: "30px",
    },
  };
  

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100vw", minHeight: "100vh" }}>
      <div style={styles.wrapper}>
        <div style={styles.header}>
          <div style={styles.timer}>
            ⏳ Time Left: {hours.toString().padStart(2, "0")}:
            {minutes.toString().padStart(2, "0")}:
            {seconds.toString().padStart(2, "0")}
          </div>
						 
										  
													
				  
			
          <div style={styles.cameraContainer}>
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={styles.video}
              />
              <canvas
                ref={canvasRef}
                style={styles.canvas}
              />
            </div>
            {micStatus && (
              <div style={styles.statusText}>{micStatus}</div>
            )}
            {faceStatus && (
              <div style={styles.statusText}>{faceStatus}</div>
            )}
          </div>
        </div>

        {quizQuestions.length === 0 ? (
          <p>No questions found. Please create questions first.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            {quizQuestions.map((q, index) => (
              <div key={index} style={styles.questionCard}>
                <div style={styles.questionText}>
                  Q{index + 1}: {q.question}
                </div>
                {q.options.map((option, i) => (
                  <label key={i} style={styles.option}>
                    <input
                      type="radio"
                      name={`question-${index}`}
                      value={option}
                      checked={userAnswers[index] === option}
                      onChange={() => handleAnswerChange(index, option)}
                      disabled={submitted}
                      style={{ marginRight: "8px" }}
                    />
                    {option}
                  </label>
                ))}
                {submitted && (
                  <div
                    style={{
                      fontWeight: "bold",
                      marginTop: "10px",
                      color: userAnswers[index] === q.correctAnswer ? "green" : "red",
                    }}
                  >
                    {userAnswers[index] === q.correctAnswer
                      ? "✅ Correct"
                      : `❌ Incorrect. Correct: ${q.correctAnswer}`}
                  </div>
                )}
              </div>
            ))}
            {submitted && (
          <div style={styles.scoreText}>
            Your Score: {getScore()} / {quizQuestions.length}
          </div>
        )}
            
             {
              submitted ?<button onClick={handleLogout} style={styles.submitBtn}>Logout</button> : <button type="submit" style={styles.submitBtn}>Submit Answers</button>
             }
              {/* <button type="submit" style={styles.submitBtn}>Submit Answers</button> */}
                           
		   
            {/* )}  */}
          </form>
        )}

        
<Modal
  show={showModal}         
  backdrop="static"
  keyboard={false}
  centered
>
  <Modal.Body
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
      padding: '40px',
    }}
  >
    {showSpinner && (
      <>
       
        <div style={{ marginTop: '20px', fontWeight: 'bold', color: '#1c3681' }}>
        Evaluating your results
        </div>
        
      </>
    )}
  </Modal.Body>
</Modal>


      </div>
    </div>
  );
};

export default DQuestions;


		 