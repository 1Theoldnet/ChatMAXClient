import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import io from 'socket.io-client'
import { FaArrowLeft, FaPaperPlane, FaSun, FaMoon, FaTrash, FaPhone, FaVideo, FaEllipsisV, FaEraser, FaUsers, FaCrown, FaMicrophone, FaMicrophoneSlash, FaVideoSlash, FaPhoneSlash } from 'react-icons/fa'
import './ChatStyle.scss'

const API_URL = 'https://chatmax-1.onrender.com'

function Chat({ toggleTheme, theme, currentUser, setCurrentUser }) {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const [chat, setChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [socket, setSocket] = useState(null)
  const messagesEndRef = useRef(null)
  const [typing, setTyping] = useState(false)
  const [typingUser, setTypingUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [otherUserStatus, setOtherUserStatus] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState(null)
  
  // Состояния для звонков
  const [isCalling, setIsCalling] = useState(false)
  const [incomingCall, setIncomingCall] = useState(null)
  const [callType, setCallType] = useState(null)
  const [callRoomId, setCallRoomId] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [localStream, setLocalStream] = useState(null)
  
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const audioContextRef = useRef(null)
  
  const isMounted = useRef(true)
  const loadChatDataRef = useRef(false)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  useEffect(() => {
    if (!currentUser) {
      navigate('/auth')
      return
    }
    
    const newSocket = io(API_URL)
    setSocket(newSocket)
    newSocket.emit('user-connected', currentUser.id)
    
    newSocket.on('new-message', (data) => {
      if (data.chatId === parseInt(chatId) && isMounted.current) {
        setMessages(prev => [...prev, data.message])
        updateMessagesInLocalStorage(parseInt(chatId), data.message)
      }
    })
    
    newSocket.on('message-deleted', (data) => {
      if (data.chatId === parseInt(chatId) && isMounted.current) {
        setMessages(prev => prev.filter(m => m.id !== data.messageId))
        deleteMessageFromLocalStorage(parseInt(chatId), data.messageId)
      }
    })
    
    newSocket.on('user-typing', (data) => {
      if (data.chatId === parseInt(chatId) && data.userId !== currentUser.id && isMounted.current) {
        setTypingUser(data.userId)
        setTimeout(() => {
          if (isMounted.current) setTypingUser(null)
        }, 1000)
      }
    })
    
    newSocket.on('user-status-changed', ({ userId, isOnline }) => {
      if (!chat?.isGroup && chat?.user?.id === userId && isMounted.current) {
        setOtherUserStatus(isOnline)
        setChat(prev => prev ? {
          ...prev,
          user: { ...prev.user, isOnline }
        } : prev)
      }
    })
    
    // Обработчики звонков
    newSocket.on('incoming-call', (data) => {
      if (data.chatId === parseInt(chatId)) {
        setIncomingCall(data)
      }
    })
    
    newSocket.on('call-rejected', (data) => {
      if (data.chatId === parseInt(chatId)) {
        alert('Звонок отклонен')
        endCall()
      }
    })
    
    newSocket.on('call-ended', (data) => {
      if (data.chatId === parseInt(chatId)) {
        alert('Звонок завершен')
        endCall()
      }
    })
    
    newSocket.on('audio-data', (data) => {
      if (data.userId !== currentUser?.id && isCalling) {
        playAudioData(data.audioData)
      }
    })
    
    newSocket.on('video-data', (data) => {
      if (data.userId !== currentUser?.id && isCalling && callType === 'video') {
        displayVideoData(data.videoData)
      }
    })
    
    if (!loadChatDataRef.current) {
      loadChatDataRef.current = true
      loadChatData()
    }
    
    return () => {
      if (newSocket) {
        newSocket.off('new-message')
        newSocket.off('message-deleted')
        newSocket.off('user-typing')
        newSocket.off('user-status-changed')
        newSocket.off('incoming-call')
        newSocket.off('call-rejected')
        newSocket.off('call-ended')
        newSocket.off('audio-data')
        newSocket.off('video-data')
        newSocket.close()
      }
    }
  }, [chatId])

  const loadChatData = async () => {
    if (!currentUser) return
    
    try {
      const storedUser = JSON.parse(localStorage.getItem('user'))
      const storedChat = storedUser?.chats?.find(c => c.id === parseInt(chatId))
      
      if (storedChat && isMounted.current) {
        setChat(storedChat)
        setMessages(storedChat.messages || [])
        if (!storedChat.isGroup && storedChat.user) {
          setOtherUserStatus(storedChat.user.isOnline || false)
        }
        setLoading(false)
      }
      
      const res = await axios.get(`${API_URL}/user/${currentUser.id}`)
      if (res.data && res.data.id && isMounted.current) {
        setCurrentUser(res.data)
        
        const currentChat = res.data.chats.find(c => c.id === parseInt(chatId))
        if (currentChat) {
          setChat(currentChat)
          setMessages(currentChat.messages || [])
          if (!currentChat.isGroup && currentChat.user) {
            setOtherUserStatus(currentChat.user.isOnline || false)
          }
        }
        setLoading(false)
      }
    } catch (err) {
      console.error('Error loading chat data', err)
      if (isMounted.current) {
        setLoading(false)
      }
    }
  }

  const updateMessagesInLocalStorage = (chatId, newMessage) => {
    const storedUser = JSON.parse(localStorage.getItem('user'))
    const chat = storedUser?.chats?.find(c => c.id === chatId)
    if (chat) {
      if (!chat.messages) chat.messages = []
      chat.messages.push(newMessage)
      localStorage.setItem('user', JSON.stringify(storedUser))
      if (setCurrentUser) setCurrentUser(storedUser)
    }
  }

  const deleteMessageFromLocalStorage = (chatId, messageId) => {
    const storedUser = JSON.parse(localStorage.getItem('user'))
    const chat = storedUser?.chats?.find(c => c.id === chatId)
    if (chat && chat.messages) {
      chat.messages = chat.messages.filter(m => m.id !== messageId)
      localStorage.setItem('user', JSON.stringify(storedUser))
      if (setCurrentUser) setCurrentUser(storedUser)
    }
  }

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return

    const messageText = newMessage
    setNewMessage('')
    
    try {
      const endpoint = chat?.isGroup ? '/message/create/group' : '/message/create/no-group'
      await axios.post(`${API_URL}${endpoint}`, {
        userId: currentUser.id,
        chatId: parseInt(chatId),
        text: messageText
      })
    } catch (err) {
      console.error('Error sending message', err)
      alert('Ошибка при отправке сообщения')
      setNewMessage(messageText)
    }
  }

  const handleDeleteMessage = async (messageId, deleteForEveryone = false) => {
    try {
      let endpoint
      if (deleteForEveryone) {
        endpoint = chat?.isGroup ? '/message/delete/group' : '/message/delete/no-group'
      } else {
        endpoint = '/message/delete/only-me'
      }
      
      await axios.delete(`${API_URL}${endpoint}`, {
        data: {
          userId: currentUser.id,
          chatId: parseInt(chatId),
          messageId: messageId
        }
      })

      setMessages(messages.filter(message => message.id !== messageId))
      setShowDeleteMenu(false)
      setSelectedMessageId(null)
    } catch (err) {
      console.error('Error deleting message', err)
      alert('Ошибка при удалении сообщения')
    }
  }

  const handleClearChat = async () => {
    if (window.confirm('Очистить всю историю сообщений? Это действие нельзя отменить.')) {
      try {
        await axios.delete(`${API_URL}/message/delete/all-only-me`, {
          data: {
            userId: currentUser.id,
            chatId: parseInt(chatId)
          }
        })
        setMessages([])
        setShowMenu(false)
        
        const storedUser = JSON.parse(localStorage.getItem('user'))
        const chat = storedUser?.chats?.find(c => c.id === parseInt(chatId))
        if (chat) {
          chat.messages = []
          localStorage.setItem('user', JSON.stringify(storedUser))
          if (setCurrentUser) setCurrentUser(storedUser)
        }
      } catch (err) {
        console.error('Error clearing chat', err)
        alert('Ошибка при очистке чата')
      }
    }
  }

  const handleTyping = (e) => {
    setNewMessage(e.target.value)
    if (!typing && e.target.value) {
      setTyping(true)
      socket?.emit('typing', { 
        chatId: parseInt(chatId), 
        userId: currentUser?.id, 
        isTyping: true 
      })
      setTimeout(() => {
        socket?.emit('typing', { 
          chatId: parseInt(chatId), 
          userId: currentUser?.id, 
          isTyping: false 
        })
        setTyping(false)
      }, 1000)
    }
  }

  // ============ ФУНКЦИИ ЗВОНКОВ ============
  
  const startCall = async (isVideo) => {
    if (chat?.isGroup) {
      alert('Групповые звонки пока не поддерживаются')
      return
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Ваш браузер не поддерживает аудио/видео звонки')
      return
    }
    
    try {
      const constraints = {
        video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      setLocalStream(stream)
      
      if (localVideoRef.current && isVideo) {
        localVideoRef.current.srcObject = stream
      }
      
      const roomId = `call_${chatId}_${Date.now()}`
      setCallRoomId(roomId)
      setCallType(isVideo ? 'video' : 'audio')
      setIsCalling(true)
      
      socket?.emit('start-call', {
        from: currentUser.id,
        to: chat.user.id,
        chatId: parseInt(chatId),
        isVideo: isVideo,
        roomId: roomId
      })
      
      startMediaCapture(stream, roomId, isVideo)
    } catch (err) {
      console.error('Error starting call:', err)
      if (err.name === 'NotAllowedError') {
        alert('Пожалуйста, разрешите доступ к микрофону и камере')
      } else if (err.name === 'NotFoundError') {
        alert('Микрофон или камера не найдены')
      } else {
        alert(`Ошибка: ${err.message}`)
      }
    }
  }

  const startMediaCapture = (stream, roomId, isVideo) => {
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
    
    const source = audioContextRef.current.createMediaStreamSource(stream)
    const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1)
    
    source.connect(processor)
    processor.connect(audioContextRef.current.destination)
    
    processor.onaudioprocess = (event) => {
      if (!isMuted && isCalling && socket && roomId && socket.connected) {
        const inputBuffer = event.inputBuffer
        const audioData = inputBuffer.getChannelData(0)
        const buffer = new ArrayBuffer(audioData.length * 4)
        const view = new Float32Array(buffer)
        view.set(audioData)
        
        socket.emit('audio-data', {
          roomId: roomId,
          audioData: buffer,
          userId: currentUser.id
        })
      }
    }
    
    if (isVideo && stream.getVideoTracks().length > 0) {
      const videoTrack = stream.getVideoTracks()[0]
      const videoElement = document.createElement('video')
      videoElement.srcObject = new MediaStream([videoTrack])
      videoElement.play()
      
      const captureFrame = async () => {
        if (!isVideoOff && isCalling && socket && roomId && socket.connected) {
          try {
            if (videoElement.videoWidth > 0) {
              const canvas = document.createElement('canvas')
              canvas.width = Math.min(videoElement.videoWidth, 320)
              canvas.height = Math.min(videoElement.videoHeight, 240)
              const ctx = canvas.getContext('2d')
              ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
              
              canvas.toBlob((blob) => {
                if (blob) {
                  const reader = new FileReader()
                  reader.onloadend = () => {
                    socket.emit('video-data', {
                      roomId: roomId,
                      videoData: reader.result,
                      userId: currentUser.id
                    })
                  }
                  reader.readAsArrayBuffer(blob)
                }
              }, 'image/jpeg', 0.3)
            }
          } catch (err) {
            console.error('Error capturing frame:', err)
          }
        }
        if (isCalling) {
          setTimeout(captureFrame, 200)
        }
      }
      
      videoElement.onloadedmetadata = () => captureFrame()
    }
  }

  const playAudioData = (audioData) => {
    try {
      const audioBuffer = new Float32Array(audioData)
      const context = new (window.AudioContext || window.webkitAudioContext)()
      if (context.state === 'suspended') context.resume()
      
      const buffer = context.createBuffer(1, audioBuffer.length, 44100)
      buffer.copyToChannel(audioBuffer, 0)
      
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.start()
      source.onended = () => context.close()
    } catch (err) {
      console.error('Error playing audio:', err)
    }
  }

  const displayVideoData = (videoData) => {
    if (remoteVideoRef.current) {
      try {
        const blob = new Blob([videoData], { type: 'image/jpeg' })
        const url = URL.createObjectURL(blob)
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
      } catch (err) {
        console.error('Error displaying video:', err)
      }
    }
  }

  const acceptCall = async () => {
    if (incomingCall) {
      try {
        const constraints = {
          video: incomingCall.isVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        }
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        setLocalStream(stream)
        
        if (localVideoRef.current && incomingCall.isVideo) {
          localVideoRef.current.srcObject = stream
        }
        
        setCallRoomId(incomingCall.roomId)
        setCallType(incomingCall.isVideo ? 'video' : 'audio')
        setIsCalling(true)
        
        socket?.emit('join-call', {
          userId: currentUser.id,
          chatId: parseInt(chatId),
          roomId: incomingCall.roomId
        })
        
        startMediaCapture(stream, incomingCall.roomId, incomingCall.isVideo)
        setIncomingCall(null)
      } catch (err) {
        console.error('Error accepting call:', err)
        alert('Не удалось получить доступ к микрофону/камере')
        rejectCall()
      }
    }
  }

  const rejectCall = () => {
    if (incomingCall) {
      socket?.emit('reject-call', {
        to: incomingCall.from,
        chatId: parseInt(chatId)
      })
      setIncomingCall(null)
    }
  }

  const endCall = () => {
    setIsCalling(false)
    setCallType(null)
    setCallRoomId(null)
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      setLocalStream(null)
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    if (socket && callRoomId) {
      socket.emit('end-call', { roomId: callRoomId, chatId: parseInt(chatId) })
    }
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) audioTrack.enabled = isMuted
    }
  }

  const toggleVideo = () => {
    setIsVideoOff(!isVideoOff)
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) videoTrack.enabled = isVideoOff
    }
  }

  const handleCall = () => startCall(false)
  const handleVideoCall = () => startCall(true)

  const openDeleteMenu = (messageId, e) => {
    e.stopPropagation()
    setSelectedMessageId(messageId)
    setShowDeleteMenu(true)
  }

  const openMembersModal = () => {
    setShowMembersModal(true)
    setShowMenu(false)
  }

  if (loading) {
    return <div className="loading">Загрузка чата...</div>
  }

  if (!chat) {
    return <div className="loading">Чат не найден</div>
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <button className="back-btn" onClick={() => navigate('/chats')}>
          <FaArrowLeft />
        </button>
        <div className="chat-avatar-container">
          <img 
            src={chat.isGroup 
              ? (chat.avatar || `https://ui-avatars.com/api/?name=${chat.title}&background=007bff&color=fff`)
              : (chat.user?.avatar || `https://ui-avatars.com/api/?name=${chat.user?.name}&background=007bff&color=fff`)
            } 
            alt=""
            onError={(e) => {
              e.target.src = `https://ui-avatars.com/api/?name=${chat.isGroup ? chat.title : chat.user?.name}&background=007bff&color=fff`
            }}
          />
          {!chat.isGroup && (
            <div className={`chat-status-indicator ${otherUserStatus ? 'online' : 'offline'}`}></div>
          )}
        </div>
        <div className="chat-header-info" onClick={chat.isGroup ? openMembersModal : undefined}>
          <h2>{chat.isGroup ? chat.title : chat.user?.name}</h2>
          {!chat.isGroup && (
            <p className={`status ${otherUserStatus ? 'online' : 'offline'}`}>
              {otherUserStatus ? 'В сети' : 'Не в сети'}
            </p>
          )}
          {chat.isGroup && (
            <p className="status">{chat.users?.length || 0} участников</p>
          )}
        </div>
        <div className="chat-actions">
          <button className="action-btn" onClick={handleCall}>
            <FaPhone />
          </button>
          <button className="action-btn" onClick={handleVideoCall}>
            <FaVideo />
          </button>
          {chat.isGroup && (
            <button className="action-btn" onClick={openMembersModal}>
              <FaUsers />
            </button>
          )}
          <div className="menu-container">
            <button className="action-btn" onClick={() => setShowMenu(!showMenu)}>
              <FaEllipsisV />
            </button>
            {showMenu && (
              <div className="dropdown-menu">
                {chat.isGroup && (
                  <button className="menu-item" onClick={openMembersModal}>
                    <FaUsers /> Участники группы
                  </button>
                )}
                <button className="menu-item" onClick={handleClearChat}>
                  <FaEraser /> Очистить чат
                </button>
              </div>
            )}
          </div>
        </div>
        <button className="theme-toggle-btn" onClick={toggleTheme}>
          {theme === 'light' ? <FaMoon /> : <FaSun />}
        </button>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="no-messages">
            <p>Нет сообщений. Напишите первое сообщение!</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={message.id || index}
              className={`message ${message.user?.id === currentUser?.id ? 'own' : 'other'}`}
            >
              {message.user?.id !== currentUser?.id && (
                <img 
                  src={message.user?.avatar || `https://ui-avatars.com/api/?name=${message.user?.name}&background=007bff&color=fff`} 
                  alt="" 
                  className="message-avatar"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${message.user?.name}&background=007bff&color=fff`
                  }}
                />
              )}
              <div className="message-content">
                <div className="message-header">
                  <span className="message-name">{message.user?.name}</span>
                  <span className="message-time">{message.time}</span>
                </div>
                <p className="message-text">{message.text}</p>
              </div>
              {message.user?.id === currentUser?.id && (
                <button 
                  className="delete-message" 
                  onClick={(e) => openDeleteMenu(message.id, e)}
                >
                  <FaTrash />
                </button>
              )}
            </div>
          ))
        )}
        {typingUser && (
          <div className="typing-indicator">
            Печатает...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
        <input
          type="text"
          placeholder="Введите сообщение..."
          value={newMessage}
          onChange={handleTyping}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <button onClick={handleSendMessage} disabled={!newMessage.trim()}>
          <FaPaperPlane />
        </button>
      </div>

      {/* Модальное окно звонка */}
      {(isCalling || incomingCall) && (
        <div className="call-modal-overlay">
          <div className={`call-modal ${callType === 'video' ? 'video-call' : 'audio-call'}`}>
            {callType === 'video' && (
              <div className="video-container">
                <div className="remote-video">
                  <canvas ref={remoteVideoRef} className="remote-canvas" />
                  <div className="waiting-video">Ожидание видео...</div>
                </div>
                <div className="local-video">
                  <video ref={localVideoRef} autoPlay playsInline muted className="local-video-element" />
                </div>
              </div>
            )}
            
            <div className="call-info">
              <img 
                src={incomingCall?.from === chat?.user?.id ? chat.user?.avatar : currentUser?.avatar} 
                alt="avatar" 
              />
              <h3>{incomingCall?.from === chat?.user?.id ? chat.user?.name : currentUser?.name}</h3>
              <p>{callType === 'video' ? 'Видеозвонок' : 'Аудиозвонок'}</p>
              <p className="call-status">{isCalling ? 'В процессе...' : 'Входящий звонок...'}</p>
            </div>

            <div className="call-controls">
              {isCalling && (
                <>
                  <button className="control-btn" onClick={toggleMute}>
                    {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                  </button>
                  {callType === 'video' && (
                    <button className="control-btn" onClick={toggleVideo}>
                      {isVideoOff ? <FaVideoSlash /> : <FaVideo />}
                    </button>
                  )}
                </>
              )}
              <button className="control-btn end-call" onClick={endCall}>
                <FaPhoneSlash />
              </button>
              {incomingCall && !isCalling && (
                <>
                  <button className="control-btn accept-call" onClick={acceptCall}>
                    <FaPhone />
                  </button>
                  <button className="control-btn reject-call" onClick={rejectCall}>
                    <FaPhoneSlash />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно удаления сообщения */}
      {showDeleteMenu && (
        <div className="delete-modal-overlay" onClick={() => setShowDeleteMenu(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Удалить сообщение</h3>
            <button 
              className="delete-option" 
              onClick={() => handleDeleteMessage(selectedMessageId, false)}
            >
              Удалить у меня
            </button>
            <button 
              className="delete-option" 
              onClick={() => handleDeleteMessage(selectedMessageId, true)}
            >
              Удалить у всех
            </button>
            <button 
              className="cancel-option" 
              onClick={() => setShowDeleteMenu(false)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Модальное окно участников группы */}
      {showMembersModal && (
        <div className="members-modal-overlay" onClick={() => setShowMembersModal(false)}>
          <div className="members-modal" onClick={(e) => e.stopPropagation()}>
            <div className="members-modal-header">
              <h3>Участники группы</h3>
              <button onClick={() => setShowMembersModal(false)}>✕</button>
            </div>
            <div className="members-list">
              {chat.users?.map((member) => (
                <div key={member.id} className="member-item">
                  <img src={member.avatar} alt={member.name} />
                  <div className="member-info">
                    <div className="member-name">
                      {member.name}
                      {member.id === chat.createdUser && (
                        <span className="owner-badge">
                          <FaCrown /> Владелец
                        </span>
                      )}
                    </div>
                    <p className={`member-status ${member.isOnline ? 'online' : 'offline'}`}>
                      {member.isOnline ? 'В сети' : 'Не в сети'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Chat