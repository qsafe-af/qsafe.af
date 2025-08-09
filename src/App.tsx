import {
  Navigate,
  Route,
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
} from "react-router-dom";
import Header from "./Header";
import Activity from "./Activity";
import BlockDetail from "./BlockDetail";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<Header />}>
      <Route path="/" element={<Navigate to="/chains/resonance/activity" />} />
      <Route path="/chains/:chainId/activity" element={<Activity />} />
      <Route path="/chains/:chainId/block/:blockNumberOrHash" element={<BlockDetail />} />
    </Route>
  ),
);

const App = () => <RouterProvider router={router} />;

export default App;
