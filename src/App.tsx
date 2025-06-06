import { Navigate, Route, createBrowserRouter, createRoutesFromElements, RouterProvider } from 'react-router-dom';
import Header from './components/Header';
import Chain from './components/Chain';
import Chains from './components/Chains';

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<Header />}>
      <Route path="/" element={<Navigate to="/chains" />} />
      <Route path="/chains" element={<Chains />} />
      <Route path="/chains/:chain" element={<Chain />} />
    </Route>
  )
);

const App = () => (
    <RouterProvider router={router} />
  );

export default App;
