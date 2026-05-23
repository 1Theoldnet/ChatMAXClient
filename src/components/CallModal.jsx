import React, { useState, useEffect, useRef } from 'react'
import { FaPhone, FaPhoneSlash, FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from 'react-icons/fa'
import './CallModalStyle.scss'

const CallModal = ({ 
  isOpen, 
  onClose, 
  callType, 
  callerName, 
  callerAvatar, 
  onAccept, 
  onReject, 
  onEndCall,
  socket,
  roomId,
  currentUserId
}) => {
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isCallActive, setIsCallActive] = useState(false)
  const [remoteStream, setRemoteStream] = useState(null)
  
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioContextRef = useRef(null)
  
  const CHUNK_SIZE = 4096 // Размер чанка для передачи

  useEffect(() => {
    if (isOpen && callType) {
      initMedia()
    }
    
    return () => {
      stopMedia()
    }
  }, [isOpen, callType])

  useEffect(() => {
    if (socket) {
      socket.on('audio-data', handleAudioData)
      socket.on('video-data', handleVideoData)
      socket.on('call-ended', () => {
        stopMedia()
        onClose()
      })
      
      return () => {
        socket.off('audio-data', handleAudioData)
        socket.off('video-data', handleVideoData)
        socket.off('call-ended')
      }
    }
  }, [socket])

  const initMedia = async () => {
    try {
      const constraints = {
        video: callType === 'video',
        audio: true
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      mediaStreamRef.current = stream
      
      if (localVideoRef.current && callType === 'video') {
        localVideoRef.current.srcObject = stream
      }
      
      startMediaCapture(stream)
      setIsCallActive(true)
    } catch (err) {
      console.error('Error accessing media devices:', err)
      alert('Не удалось получить доступ к камере/микрофону')
      onClose()
    }
  }

  const startMediaCapture = (stream) => {
    // Аудио захват
    audioContextRef.current = new AudioContext()
    const source = audioContextRef.current.createMediaStreamSource(stream)
    const processor = audioContextRef.current.createScriptProcessor(CHUNK_SIZE, 1, 1)
    
    source.connect(processor)
    processor.connect(audioContextRef.current.destination)
    
    processor.onaudioprocess = (event) => {
      if (!isMuted && isCallActive && socket && roomId) {
        const inputBuffer = event.inputBuffer
        const audioData = inputBuffer.getChannelData(0)
        const buffer = new ArrayBuffer(audioData.length * 4)
        const view = new Float32Array(buffer)
        view.set(audioData)
        
        socket.emit('audio-data', {
          roomId: roomId,
          audioData: buffer,
          userId: currentUserId
        })
      }
    }
    
    // Видео захват (если есть)
    if (callType === 'video' && stream.getVideoTracks().length > 0) {
      const videoTrack = stream.getVideoTracks()[0]
      const imageCapture = new ImageCapture(videoTrack)
      
      const captureFrame = async () => {
        if (!isVideoOff && isCallActive && socket && roomId) {
          try {
            const bitmap = await imageCapture.grabFrame()
            const canvas = document.createElement('canvas')
            canvas.width = bitmap.width
            canvas.height = bitmap.height
            const ctx = canvas.getContext('2d')
            ctx.drawImage(bitmap, 0, 0)
            
            canvas.toBlob((blob) => {
              const reader = new FileReader()
              reader.onloadend = () => {
                socket.emit('video-data', {
                  roomId: roomId,
                  videoData: reader.result,
                  userId: currentUserId
                })
              }
              reader.readAsArrayBuffer(blob)
            }, 'image/jpeg', 0.5)
          } catch (err) {
            console.error('Error capturing frame:', err)
          }
        }
        requestAnimationFrame(captureFrame)
      }
      
      captureFrame()
    }
  }

  const handleAudioData = (data) => {
    if (data.userId !== currentUserId && remoteVideoRef.current) {
      const audioBuffer = new Float32Array(data.audioData)
      // Воспроизведение аудио (упрощенная версия)
      if (!remoteStream) {
        const context = new AudioContext()
        const buffer = context.createBuffer(1, audioBuffer.length, context.sampleRate)
        buffer.copyToChannel(audioBuffer, 0)
        
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(context.destination)
        source.start()
      }
    }
  }

  const handleVideoData = (data) => {
    if (data.userId !== currentUserId && callType === 'video') {
      const blob = new Blob([data.videoData], { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      
      if (remoteVideoRef.current) {
        const img = new Image()
        img.onload = () => {
          const canvas = remoteVideoRef.current
          if (canvas) {
            const ctx = canvas.getContext('2d')
            canvas.width = img.width
            canvas.height = img.height
            ctx.drawImage(img, 0, 0)
          }
          URL.revokeObjectURL(url)
        }
        img.src = url
      }
    }
  }

  const stopMedia = () => {
    setIsCallActive(false)
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    
    if (socket && roomId) {
      socket.emit('end-call', { roomId, chatId: parseInt(roomId.split('_')[1]) })
    }
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = isMuted
      }
    }
  }

  const toggleVideo = () => {
    setIsVideoOff(!isVideoOff)
    if (mediaStreamRef.current) {
      const videoTrack = mediaStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = isVideoOff
      }
    }
  }

  const handleAccept = () => {
    if (onAccept) onAccept()
  }

  const handleReject = () => {
    if (onReject) onReject()
    stopMedia()
    onClose()
  }

  const handleEndCall = () => {
    stopMedia()
    if (onEndCall) onEndCall()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="call-modal-overlay">
      <div className={`call-modal ${callType === 'video' ? 'video-call' : 'audio-call'}`}>
        {callType === 'video' && (
          <div className="video-container">
            <div className="remote-video">
              <canvas ref={remoteVideoRef} className="remote-canvas" />
              {!remoteStream && <div className="waiting-video">Ожидание видео...</div>}
            </div>
            <div className="local-video">
              <video ref={localVideoRef} autoPlay playsInline muted className="local-video-element" />
            </div>
          </div>
        )}
        
        <div className="call-info">
          <img src={callerAvatar} alt={callerName} />
          <h3>{callerName}</h3>
          <p>{callType === 'video' ? 'Видеозвонок' : 'Аудиозвонок'}</p>
          <p className="call-status">{isCallActive ? 'Соединение установлено' : 'Подключение...'}</p>
        </div>

        <div className="call-controls">
          <button className="control-btn" onClick={toggleMute}>
            {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
          </button>
          {callType === 'video' && (
            <button className="control-btn" onClick={toggleVideo}>
              {isVideoOff ? <FaVideoSlash /> : <FaVideo />}
            </button>
          )}
          <button className="control-btn end-call" onClick={handleEndCall}>
            <FaPhoneSlash />
          </button>
          {onAccept && (
            <>
              <button className="control-btn accept-call" onClick={handleAccept}>
                <FaPhone />
              </button>
              <button className="control-btn reject-call" onClick={handleReject}>
                <FaPhoneSlash />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CallModal