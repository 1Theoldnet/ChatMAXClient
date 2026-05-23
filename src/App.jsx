import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import axios from 'axios'
import Auth from './pages/Auth/Auth'
import Chats from './pages/Chats/Chats'
import Chat from './pages/Chat/Chat'
import './index.scss'

const API_URL = 'http://localhost:3000'

function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) return savedTheme
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // Загрузка текущего пользователя при старте
  useEffect(() => {
    const loadCurrentUser = async () => {
      const storedUser = localStorage.getItem('user')
      if (storedUser) {
        const user = JSON.parse(storedUser)
        try {
          // Проверяем актуальные данные с сервера
          const res = await axios.get(`${API_URL}/user/${user.id}`)
          if (res.data && res.data.id) {
            setCurrentUser(res.data)
            localStorage.setItem('user', JSON.stringify(res.data))
          } else {
            setCurrentUser(user)
          }
        } catch (err) {
          console.error('Error loading user', err)
          setCurrentUser(user)
        }
      }
      setLoading(false)
    }
    
    loadCurrentUser()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const updateCurrentUser = (user) => {
    setCurrentUser(user)
    localStorage.setItem('user', JSON.stringify(user))
  }

  const logout = () => {
    localStorage.removeItem('user')
    setCurrentUser(null)
  }

  if (loading) {
    return <div className="loading-app">Загрузка...</div>
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={currentUser ? "/chats" : "/auth"} />} />
      <Route path="/auth" element={
        <Auth 
          toggleTheme={toggleTheme} 
          theme={theme} 
          setCurrentUser={updateCurrentUser}
          currentUser={currentUser}
        />
      } />
      <Route path="/chats" element={
        currentUser ? (
          <Chats 
            toggleTheme={toggleTheme} 
            theme={theme} 
            currentUser={currentUser}
            setCurrentUser={updateCurrentUser}
            logout={logout}
          />
        ) : (
          <Navigate to="/auth" />
        )
      } />
      <Route path="/chat/:chatId" element={
        currentUser ? (
          <Chat 
            toggleTheme={toggleTheme} 
            theme={theme} 
            currentUser={currentUser}
            setCurrentUser={updateCurrentUser}
          />
        ) : (
          <Navigate to="/auth" />
        )
      } />
    </Routes>
  )
}

export default App