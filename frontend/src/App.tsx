import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'

// heavier pages (charts, graph layout) load on demand
const Lab = lazy(() => import('./pages/Lab'))
const Analyzer = lazy(() => import('./pages/Analyzer'))
const Graph = lazy(() => import('./pages/Graph'))
const Swarm = lazy(() => import('./pages/Swarm'))
const Sentinel = lazy(() => import('./pages/Sentinel'))
const Results = lazy(() => import('./pages/Results'))
const Audit = lazy(() => import('./pages/Audit'))

function Loading() {
  return (
    <div className="grid h-[70vh] place-items-center">
      <span className="h-2 w-2 animate-pulse-slow rounded-full bg-signal shadow-[0_0_20px_#ff3b2f]" />
    </div>
  )
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/analyze" element={<Analyzer />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/swarm" element={<Swarm />} />
          <Route path="/sentinel" element={<Sentinel />} />
          <Route path="/results" element={<Results />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}
