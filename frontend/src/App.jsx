import { Route, Routes } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import Favorites from './pages/Favorites'
import Library from './pages/Library'
import MyLibrary from './pages/MyLibrary'
import Profile from './pages/Profile'
import Reader from './pages/Reader'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/my-library" element={<MyLibrary />} />
      <Route path="/favorites" element={<Favorites />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/read/:id" element={<Reader />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
    </Routes>
  )
}
