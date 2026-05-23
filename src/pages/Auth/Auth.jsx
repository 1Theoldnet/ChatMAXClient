import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { FaUser, FaLock, FaEnvelope, FaSun, FaMoon } from 'react-icons/fa'
import './AuthStyle.scss'

const API_URL = 'https://chatmax-1.onrender.com'

function Auth({ toggleTheme, theme, setCurrentUser, currentUser }) {
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    avatar: '',
    description: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // Если пользователь уже авторизован, перенаправляем
  React.useEffect(() => {
    if (currentUser) {
      navigate('/chats')
    }
  }, [currentUser, navigate])

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        const res = await axios.post(`${API_URL}/user/login`, {
          name: formData.name,
          password: formData.password
        })
        if (res.data.user) {
          setCurrentUser(res.data.user)
          navigate('/chats')
        } else {
          setError(res.data.message)
        }
      } else {
        const avatarUrl = formData.avatar || `https://ui-avatars.com/api/?name=${formData.name}&background=007bff&color=fff&bold=true&size=128`
        
        const res = await axios.post(`${API_URL}/user/register`, {
          name: formData.name,
          password: formData.password,
          avatar: avatarUrl,
          description: formData.description
        })
        if (res.data.user) {
          setCurrentUser(res.data.user)
          navigate('/chats')
        } else {
          setError(res.data.message)
        }
      }
    } catch (err) {
      setError('Ошибка соединения с сервером')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="theme-toggle" onClick={toggleTheme}>
        {theme === 'light' ? <FaMoon /> : <FaSun />}
      </div>
      
      <div className="auth-card">
        <div className="auth-header">
          <h1>{isLogin ? 'Вход' : 'Регистрация'}</h1>
          <p>{isLogin ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт'}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <FaUser className="input-icon" />
            <input
              type="text"
              name="name"
              placeholder="Имя пользователя"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <FaLock className="input-icon" />
            <input
              type="password"
              name="password"
              placeholder="Пароль"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          {!isLogin && (
            <>
              <div className="input-group">
                <FaEnvelope className="input-icon" />
                <input
                  type="text"
                  name="avatar"
                  placeholder="URL аватара (опционально)"
                  value={formData.avatar}
                  onChange={handleChange}
                />
              </div>

              <div className="input-group">
                <textarea
                  name="description"
                  placeholder="О себе (опционально)"
                  value={formData.description}
                  onChange={handleChange}
                  rows="3"
                />
              </div>
            </>
          )}

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>

        <div className="auth-footer">
          <button onClick={() => setIsLogin(!isLogin)} className="switch-btn">
            {isLogin ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Auth