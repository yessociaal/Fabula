import { useEffect } from 'react'
import { ToastHost } from './components/Toast'
import { startAutosave } from './store/autosave'
import { useProjectStore } from './store/projectStore'
import Home from './views/Home/Home'
import Shell from './views/Shell/Shell'

export default function App() {
  const open = useProjectStore((s) => s.project !== null)

  useEffect(() => {
    startAutosave()
  }, [])

  return (
    <>
      {open ? <Shell /> : <Home />}
      <ToastHost />
    </>
  )
}
