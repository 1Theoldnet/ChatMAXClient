import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import io from 'socket.io-client'
import Peer from 'peerjs'
import { 
  FaArrowLeft, FaPaperPlane, FaSun, FaMoon, FaTrash, 
  FaPhone, FaVideo, FaEllipsisV, FaEraser, FaUsers, 
  FaCrown, FaMicrophone, FaMicrophoneSlash, FaVideoSlash, 
  FaPhoneSlash, FaImage, FaFileAudio, FaFileVideo, FaPaperclip,
  FaPlay, FaPause, FaStop, FaFile
} from 'react-icons/fa'
import './ChatStyle.scss'

const API_URL = 'https://chatmax-1.onrender.com'
const PEER_CONFIG = {
  host: 'chatmax-1.onrender.com',
  port: 3001,
  path: '/peerjs',
  secure: true
}

function Chat({ toggleTheme, theme, currentUser, setCurrentUser }) {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const [chat, setChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [socket, setSocket] = useState(null)
  const [peer, setPeer] = useState(null)
  const [myPeerId, setMyPeerId] = useState(null)
  const messagesEndRef = useRef(null)
  const [typing, setTyping] = useState(false)
  const [typingUser, setTypingUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [otherUserStatus, setOtherUserStatus] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState(null)
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
  
  // Состояния для медиафайлов
  const [uploading, setUploading] = useState(false)
  const [playingAudioId, setPlayingAudioId] = useState(null)
  const audioRefs = useRef({})
  
  // Состояния для голосовых сообщений
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const recordingTimerRef = useRef(null)
  
  // Состояния для звонков
  const [isCalling, setIsCalling] = useState(false)
  const [incomingCall, setIncomingCall] = useState(null)
  const [callType, setCallType] = useState(null)
  const [currentCall, setCurrentCall] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  
  // Refs
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const fileInputRef = useRef(null)
  const attachmentMenuRef = useRef(null)
  
  const isMounted = useRef(true)
  const loadChatDataRef = useRef(false)

  // Закрытие меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target)) {
        setShowAttachmentMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      if (currentCall) {
        currentCall.close()
      }
      if (peer) {
        peer.destroy()
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }, [])

  // Инициализация PeerJS
  useEffect(() => {
    if (!currentUser) return
    
    const peerInstance = new Peer(currentUser.id.toString(), PEER_CONFIG)
    
    peerInstance.on('open', (id) => {
      console.log('My Peer ID:', id)
      setMyPeerId(id)
      
      // Обновляем пользователя с peerId
      const updatedUser = { ...currentUser, peerId: id }
      setCurrentUser(updatedUser)
      localStorage.setItem('user', JSON.stringify(updatedUser))
    })
    
    peerInstance.on('call', (call) => {
      console.log('Incoming call from:', call.peer)
      setIncomingCall({
        call: call,
        from: call.peer,
        isVideo: call.metadata?.isVideo || false
      })
    })
    
    peerInstance.on('error', (err) => {
      console.error('Peer error:', err)
    })
    
    setPeer(peerInstance)
    
    return () => {
      peerInstance.destroy()
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser) {
      navigate('/auth')
      return
    }
    
    const newSocket = io(API_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    })
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
    
    // PeerJS сигнальные сообщения через Socket.IO
    newSocket.on('peer-call-answered', (data) => {
      if (data.callId === currentCall?.callId && currentCall) {
        console.log('Call answered')
      }
    })
    
    newSocket.on('peer-call-rejected', (data) => {
      if (data.chatId === parseInt(chatId)) {
        alert('Звонок отклонен')
        endCall()
      }
    })
    
    newSocket.on('peer-call-ended', (data) => {
      if (data.chatId === parseInt(chatId)) {
        alert('Звонок завершен')
        endCall()
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
        newSocket.off('peer-call-answered')
        newSocket.off('peer-call-rejected')
        newSocket.off('peer-call-ended')
        newSocket.close()
      }
    }
  }, [chatId])

  // ============ ФУНКЦИИ ДЛЯ ЗВОНКОВ (PeerJS) ============
  
  const startCall = async (isVideo) => {
    if (chat?.isGroup) {
      alert('Групповые звонки пока не поддерживаются')
      return
    }
    
    if (!peer) {
      alert('Подключение к серверу не установлено')
      return
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Ваш браузер не поддерживает аудио/видео звонки')
      return
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideo,
        audio: true
      })
      
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      
      const targetPeerId = chat.user.peerId || chat.user.id.toString()
      
      const call = peer.call(targetPeerId, stream, {
        metadata: { isVideo, from: currentUser.id }
      })
      
      call.on('stream', (remoteStream) => {
        setRemoteStream(remoteStream)
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream
        }
      })
      
      call.on('close', () => {
        endCall()
      })
      
      call.on('error', (err) => {
        console.error('Call error:', err)
        alert('Ошибка при звонке')
        endCall()
      })
      
      setCurrentCall({ call, callId: `call_${Date.now()}` })
      setCallType(isVideo ? 'video' : 'audio')
      setIsCalling(true)
      
      socket?.emit('peer-call-initiated', {
        from: currentUser.id,
        to: chat.user.id,
        chatId: parseInt(chatId),
        isVideo: isVideo
      })
      
    } catch (err) {
      console.error('Error starting call:', err)
      if (err.name === 'NotAllowedError') {
        alert('Пожалуйста, разрешите доступ к микрофону и камере')
      } else {
        alert('Не удалось получить доступ к микрофону/камере')
      }
    }
  }
  
  const acceptCall = async () => {
    if (!incomingCall) return
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: incomingCall.isVideo,
        audio: true
      })
      
      setLocalStream(stream)
      if (localVideoRef.current && incomingCall.isVideo) {
        localVideoRef.current.srcObject = stream
      }
      
      const call = incomingCall.call
      call.answer(stream)
      
      call.on('stream', (remoteStream) => {
        setRemoteStream(remoteStream)
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream
        }
      })
      
      call.on('close', () => {
        endCall()
      })
      
      setCurrentCall({ call, callId: `call_${Date.now()}` })
      setCallType(incomingCall.isVideo ? 'video' : 'audio')
      setIsCalling(true)
      setIncomingCall(null)
      
      socket?.emit('peer-call-answered', {
        to: currentUser.id,
        chatId: parseInt(chatId)
      })
      
    } catch (err) {
      console.error('Error accepting call:', err)
      alert('Не удалось получить доступ к микрофону/камере')
      rejectCall()
    }
  }
  
  const rejectCall = () => {
    if (incomingCall) {
      incomingCall.call.close()
      setIncomingCall(null)
      
      socket?.emit('peer-call-rejected', {
        to: currentUser.id,
        chatId: parseInt(chatId)
      })
    }
  }
  
  const endCall = () => {
    if (currentCall) {
      currentCall.call.close()
      setCurrentCall(null)
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      setLocalStream(null)
    }
    
    setRemoteStream(null)
    setIsCalling(false)
    setCallType(null)
    setIsMuted(false)
    setIsVideoOff(false)
    
    socket?.emit('peer-call-ended', {
      chatId: parseInt(chatId),
      userId: currentUser.id
    })
  }
  
  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)
      }
    }
  }
  
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoOff(!videoTrack.enabled)
      }
    }
  }
  
  const handleCall = () => startCall(false)
  const handleVideoCall = () => startCall(true)

  // ============ ФУНКЦИИ ДЛЯ ГОЛОСОВЫХ СООБЩЕНИЙ ============
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []
      
      recorder.ondataavailable = (e) => {
        chunks.push(e.data)
      }
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onloadend = async () => {
          await sendVoiceMessage(reader.result)
        }
        reader.readAsDataURL(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }
      
      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
      setRecordingTime(0)
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
    } catch (err) {
      console.error('Error starting recording:', err)
      alert('Не удалось получить доступ к микрофону')
    }
  }
  
  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop()
      setIsRecording(false)
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }
  
  const sendVoiceMessage = async (base64Audio) => {
    try {
      const endpoint = chat?.isGroup ? '/message/create/group' : '/message/create/no-group'
      await axios.post(`${API_URL}${endpoint}`, {
        userId: currentUser.id,
        chatId: parseInt(chatId),
        text: '',
        audio: base64Audio
      })
    } catch (err) {
      console.error('Error sending voice message:', err)
      alert('Ошибка при отправке голосового сообщения')
    }
  }
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // ============ ФУНКЦИИ ДЛЯ МЕДИАФАЙЛОВ ============
  
  const handleFileSelect = (type) => {
    setFileType(type)
    fileInputRef.current?.click()
    setShowAttachmentMenu(false)
  }
  
  const [fileType, setFileType] = useState(null)
  
  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    if (file.size > 50 * 1024 * 1024) {
      alert('Файл слишком большой. Максимальный размер 50MB')
      return
    }
    
    setUploading(true)
    
    try {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64Data = reader.result
        
        const messageData = {
          userId: currentUser.id,
          chatId: parseInt(chatId),
          text: ''
        }
        
        if (fileType === 'photo') {
          messageData.photo = base64Data
        } else if (fileType === 'video') {
          messageData.video = base64Data
        } else if (fileType === 'audio') {
          messageData.audio = base64Data
        } else if (fileType === 'file') {
          messageData.file = {
            name: file.name,
            size: file.size,
            type: file.type,
            data: base64Data
          }
        }
        
        const endpoint = chat?.isGroup ? '/message/create/group' : '/message/create/no-group'
        await axios.post(`${API_URL}${endpoint}`, messageData)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      console.error('Error sending file:', err)
      alert('Ошибка при отправке файла')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }
  
  const toggleAudioPlay = (messageId, audioSrc) => {
    if (playingAudioId === messageId) {
      const audio = audioRefs.current[messageId]
      if (audio) {
        audio.pause()
        setPlayingAudioId(null)
      }
    } else {
      if (playingAudioId && audioRefs.current[playingAudioId]) {
        audioRefs.current[playingAudioId].pause()
      }
      setPlayingAudioId(messageId)
      const audio = audioRefs.current[messageId]
      if (audio) {
        audio.play()
        audio.onended = () => setPlayingAudioId(null)
      }
    }
  }
  
  const renderMediaContent = (message) => {
    if (message.photo) {
      return (
        <div className="message-photo">
          <img src={message.photo} alt="photo" onClick={() => window.open(message.photo, '_blank')} />
        </div>
      )
    }
    
    if (message.video) {
      return (
        <div className="message-video">
          <video src={message.video} controls preload="metadata">
            Ваш браузер не поддерживает видео
          </video>
        </div>
      )
    }
    
    if (message.audio) {
      const isVoiceNote = message.audio.length < 500000
      return (
        <div className={`message-audio ${isVoiceNote ? 'voice-note' : ''}`}>
          <audio 
            ref={el => audioRefs.current[message.id] = el}
            src={message.audio} 
            preload="metadata"
          />
          <button 
            className="audio-play-btn" 
            onClick={() => toggleAudioPlay(message.id, message.audio)}
          >
            {playingAudioId === message.id ? <FaPause /> : <FaPlay />}
          </button>
          {isVoiceNote && (
            <div className="audio-wave">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          )}
          <span className="audio-duration">
            {isVoiceNote ? 'Голосовое сообщение' : 'Аудио'}
          </span>
        </div>
      )
    }
    
    if (message.file) {
      const fileSize = (message.file.size / 1024 / 1024).toFixed(2)
      return (
        <div className="message-file">
          <FaFile />
          <div className="file-info">
            <span className="file-name">{message.file.name}</span>
            <span className="file-size">{fileSize} MB</span>
          </div>
          <a href={message.file.data} download={message.file.name} className="download-file">
            Скачать
          </a>
        </div>
      )
    }
    
    return null
  }

  // ============ ОСТАЛЬНЫЕ ФУНКЦИИ ============
  
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
        const userData = { ...res.data, peerId: myPeerId }
        setCurrentUser(userData)
        localStorage.setItem('user', JSON.stringify(userData))
        
        const currentChat = userData.chats.find(c => c.id === parseInt(chatId))
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
                {message.text && <p className="message-text">{message.text}</p>}
                {renderMediaContent(message)}
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
        <div className="attachment-wrapper" ref={attachmentMenuRef}>
          <button 
            className={`attachment-btn ${showAttachmentMenu ? 'active' : ''}`}
            onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
          >
            <FaPaperclip />
          </button>
          
          <div className={`attachment-menu ${showAttachmentMenu ? 'show' : ''}`}>
            <button onClick={() => handleFileSelect('photo')} className="attachment-item">
              <FaImage style={{ color: '#4CAF50' }} />
              <span>Фото</span>
            </button>
            <button onClick={() => handleFileSelect('video')} className="attachment-item">
              <FaFileVideo style={{ color: '#2196F3' }} />
              <span>Видео</span>
            </button>
            <button onClick={() => handleFileSelect('audio')} className="attachment-item">
              <FaFileAudio style={{ color: '#FF9800' }} />
              <span>Аудио</span>
            </button>
            <button onClick={() => handleFileSelect('file')} className="attachment-item">
              <FaFile style={{ color: '#9C27B0' }} />
              <span>Файл</span>
            </button>
          </div>
        </div>
        
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileChange}
        />
        
        {isRecording ? (
          <div className="recording-controls">
            <span className="recording-timer">
              <span className="recording-dot"></span>
              {formatTime(recordingTime)}
            </span>
            <button className="stop-recording" onClick={stopRecording}>
              <FaStop />
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Введите сообщение..."
              value={newMessage}
              onChange={handleTyping}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={uploading}
            />
            <button 
              className="voice-message-btn" 
              onClick={startRecording}
              title="Голосовое сообщение"
            >
              <FaMicrophone />
            </button>
          </>
        )}
        
        <button onClick={handleSendMessage} disabled={!newMessage.trim() || uploading || isRecording}>
          {uploading ? '...' : <FaPaperPlane />}
        </button>
      </div>

      {/* Модальное окно звонка */}
      {(isCalling || incomingCall) && (
        <div className="call-modal-overlay">
          <div className={`call-modal ${callType === 'video' ? 'video-call' : 'audio-call'}`}>
            {callType === 'video' && (
              <div className="video-container">
                <div className="remote-video">
                  <video ref={remoteVideoRef} autoPlay playsInline className="remote-video-element" />
                  {!remoteStream && <div className="waiting-video">Ожидание видео...</div>}
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