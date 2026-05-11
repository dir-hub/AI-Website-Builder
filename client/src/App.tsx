import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Projects from './pages/Projects'
import View from './pages/View'
import MyProjects from './pages/MyProjects'
import Community from './pages/Community'
import Pricing from './pages/Pricing'
import Preview from './pages/Preview'
import Navbar from './components/Navbar'
import { Toaster } from "@/components/ui/sonner"
import AuthPage from './pages/auth/AuthPage'
import Settings from './pages/Settings'
import Loading from './pages/Loading'

const App = () => {

  const { pathname } = useLocation();

  const hideNavbar = pathname.startsWith('/projects/') && pathname !== '/projects' || pathname.startsWith('/view/') || pathname.startsWith('/preview/');
  return (
    <div>
      <Toaster />
      {!hideNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects" element={<MyProjects />} />
        <Route path="/projects/:projectId" element={<Projects />} />
        <Route path="/view/:projectId" element={<View />} />       
        <Route path="/community" element={<Community />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/preview/:projectId" element={<Preview />} /> 
        <Route path="/preview/:projectId/:versionId" element={<Preview />} /> 
        <Route path="/auth/:pathname" element={<AuthPage />} />
        <Route path="/account/settings" element={<Settings />} />
        <Route path="/loading" element={<Loading />} />
      </Routes>
    </div>
  )
}

export default App