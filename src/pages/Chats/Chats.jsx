import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import io from 'socket.io-client'
import { FaSearch, FaPlus, FaSignOutAlt, FaMoon, FaSun, FaUsers, FaUser } from 'react-icons/fa'
import './ChatsStyle.scss'

const API_URL = 'https://chatmax-1.onrender.com'

function Chats({ toggleTheme, theme, currentUser, setCurrentUser, logout }) {
  const [chats, setChats] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [chatType, setChatType] = useState('private')
  const [selectedUser, setSelectedUser] = useState(null)
  const [groupUsers, setGroupUsers] = useState([])
  const [groupTitle, setGroupTitle] = useState('')
  const [groupAvatar, setGroupAvatar] = useState('')
  const [loading, setLoading] = useState(false)
  const [socket, setSocket] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!currentUser) {
      navigate('/auth')
      return
    }
    
    // Подключение к Socket.IO
    const newSocket = io(API_URL)
    setSocket(newSocket)
    newSocket.emit('user-connected', currentUser.id)
    
    newSocket.on('user-status-changed', ({ userId, isOnline }) => {
      updateUserStatus(userId, isOnline)
    })
    
    newSocket.on('chat-created', () => {
      loadUserData()
    })
    
    newSocket.on('group-created', () => {
      loadUserData()
    })
    
    loadUserData()
    loadAllUsers()
    
    return () => {
      newSocket.close()
    }
  }, [currentUser])

  const updateUserStatus = (userId, isOnline) => {
    setChats(prevChats => 
      prevChats.map(chat => {
        if (!chat.isGroup && chat.user?.id === userId) {
          return { ...chat, user: { ...chat.user, isOnline } }
        }
        return chat
      })
    )
    
    setAllUsers(prevUsers =>
      prevUsers.map(u => u.id === userId ? { ...u, isOnline } : u)
    )
  }

  const loadUserData = async () => {
    try {
      const res = await axios.get(`${API_URL}/user/${currentUser.id}`)
      if (res.data && res.data.id) {
        setCurrentUser(res.data)
        setChats(res.data.chats || [])
      }
    } catch (err) {
      console.error('Error loading user data', err)
    }
  }

  const loadAllUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/users`)
      setAllUsers(res.data)
    } catch (err) {
      console.error('Error loading users', err)
    }
  }

  const handleCreatePrivateChat = async () => {
    if (!selectedUser) {
      alert('Выберите пользователя')
      return
    }

    setLoading(true)
    try {
      const res = await axios.post(`${API_URL}/chat/create/no-group`, {
        userId: currentUser.id,
        toUserId: selectedUser.id
      })
      
      if (res.data.message === 'Чат успешно создан!') {
        await loadUserData()
        setShowCreateModal(false)
        setSelectedUser(null)
        alert('Чат успешно создан!')
      }
    } catch (err) {
      console.error('Error creating chat', err)
      alert('Ошибка при создании чата')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroupChat = async () => {
    if (groupUsers.length < 2) {
      alert('Добавьте хотя бы 2 пользователей в группу')
      return
    }

    if (!groupTitle.trim()) {
      alert('Введите название группы')
      return
    }

    setLoading(true)
    try {
      let avatarUrl = groupAvatar
      
      if (!avatarUrl) {
        avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(groupTitle)}&background=007bff&color=fff&bold=true&size=128`
      }

      const res = await axios.post(`${API_URL}/chat/create/group`, {
        createdUser: currentUser.id,
        userIds: groupUsers,
        title: groupTitle,
        avatar: avatarUrl
      })
      
      if (res.data.chat) {
        await loadUserData()
        setShowCreateModal(false)
        setGroupUsers([])
        setGroupTitle('')
        setGroupAvatar('')
        alert('Группа успешно создана!')
      }
    } catch (err) {
      console.error('Error creating group', err)
      alert('Ошибка при создании группы')
    } finally {
      setLoading(false)
    }
  }

  const filteredChats = chats.filter(chat => {
    if (!searchTerm) return true
    if (chat.isGroup) {
      return chat.title?.toLowerCase().includes(searchTerm.toLowerCase())
    } else {
      return chat.user?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    }
  })

  const availableUsers = allUsers.filter(u => 
    u.id !== currentUser?.id && 
    !chats.some(chat => !chat.isGroup && chat.user?.id === u.id)
  )

  if (!currentUser) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="chats-container">
      <div className="chats-header">
        <div className="header-left">
          <h1>Чаты</h1>
          <div className="user-info-header">
            <img src={currentUser.avatar} alt={currentUser.name} />
            <span>{currentUser.name}</span>
          </div>
        </div>
        <div className="header-right">
          <button className="theme-toggle-btn" onClick={toggleTheme}>
            {theme === 'light' ? <FaMoon /> : <FaSun />}
          </button>
          <button className="logout-btn" onClick={logout}>
            <FaSignOutAlt />
          </button>
        </div>
      </div>

      <div className="search-bar">
        <FaSearch />
        <input
          type="text"
          placeholder="Поиск чатов..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button className="create-group-btn" onClick={() => setShowCreateModal(true)}>
          <FaPlus />
        </button>
      </div>

      <div className="chats-list">
        {filteredChats.length === 0 ? (
          <div className="no-chats">
            <p>У вас нет чатов</p>
            <button onClick={() => setShowCreateModal(true)}>Создать чат</button>
          </div>
        ) : (
          filteredChats.map(chat => (
            <div key={chat.id} className="chat-item" onClick={() => navigate(`/chat/${chat.id}`)}>
              <div className="chat-avatar-container">
                <img 
                  src={chat.isGroup ? chat.avatar : chat.user?.avatar} 
                  alt={chat.isGroup ? chat.title : chat.user?.name}
                  className="chat-avatar"
                />
                {!chat.isGroup && (
                  <div className={`chat-online-indicator ${chat.user?.isOnline ? 'online' : 'offline'}`}></div>
                )}
              </div>
              <div className="chat-info">
                <h3>{chat.isGroup ? chat.title : chat.user?.name}</h3>
                <p className="last-message">
                  {chat.messages && chat.messages.length > 0 
                    ? chat.messages[chat.messages.length - 1]?.text 
                    : 'Нет сообщений'}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateModal && (
        <div className="create-chat-modal" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Создать чат</h2>
              <button onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            <div className="chat-type-selector">
              <button 
                className={`type-btn ${chatType === 'private' ? 'active' : ''}`}
                onClick={() => setChatType('private')}
              >
                <FaUser /> Личный чат
              </button>
              <button 
                className={`type-btn ${chatType === 'group' ? 'active' : ''}`}
                onClick={() => setChatType('group')}
              >
                <FaUsers /> Групповой чат
              </button>
            </div>

            {chatType === 'private' ? (
              <>
                <div className="users-select">
                  <h3>Выберите пользователя</h3>
                  <div className="users-list">
                    {availableUsers.map(u => (
                      <div 
                        key={u.id} 
                        className={`user-item ${selectedUser?.id === u.id ? 'selected' : ''}`}
                        onClick={() => setSelectedUser(u)}
                      >
                        <img src={u.avatar} alt={u.name} />
                        <div className="user-info">
                          <h4>{u.name}</h4>
                          <p>{u.description || 'Нет описания'}</p>
                        </div>
                        <div className={`user-status ${u.isOnline ? 'online' : 'offline'}`}></div>
                        <div className="radio-btn">
                          {selectedUser?.id === u.id && <div className="radio-selected" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <button 
                  className="submit-btn" 
                  onClick={handleCreatePrivateChat}
                  disabled={!selectedUser || loading}
                >
                  {loading ? 'Создание...' : 'Создать чат'}
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Название группы"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="URL аватара (опционально)"
                  value={groupAvatar}
                  onChange={(e) => setGroupAvatar(e.target.value)}
                />
                <div className="users-select">
                  <h3>Выберите участников ({groupUsers.length})</h3>
                  <div className="users-list">
                    {allUsers.filter(u => u.id !== currentUser?.id).map(u => (
                      <div 
                        key={u.id} 
                        className={`user-item ${groupUsers.includes(u.id) ? 'selected' : ''}`}
                        onClick={() => {
                          if (groupUsers.includes(u.id)) {
                            setGroupUsers(groupUsers.filter(id => id !== u.id))
                          } else {
                            setGroupUsers([...groupUsers, u.id])
                          }
                        }}
                      >
                        <img src={u.avatar} alt={u.name} />
                        <div className="user-info">
                          <h4>{u.name}</h4>
                          <p>{u.description || 'Нет описания'}</p>
                        </div>
                        <div className={`user-status ${u.isOnline ? 'online' : 'offline'}`}></div>
                        <div className="checkbox">
                          {groupUsers.includes(u.id) && <div className="checkbox-checked" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <button 
                  className="submit-btn" 
                  onClick={handleCreateGroupChat}
                  disabled={groupUsers.length < 2 || !groupTitle.trim() || loading}
                >
                  {loading ? 'Создание...' : 'Создать группу'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Chats