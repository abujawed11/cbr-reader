import { Route, Routes } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import Library from './pages/Library'
import Reader from './pages/Reader'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/read/:id" element={<Reader />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
    </Routes>
  )
}
