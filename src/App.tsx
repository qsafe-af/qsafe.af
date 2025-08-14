import {
  Navigate,
  Route,
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
} from "react-router-dom";
import Header from "./Header";
import Activity from "./Activity";
import BlockDetail from "./components/BlockDetail";
import MiningStats from "./components/MiningStats";
import Account from "./components/Account";
import Nodes from "./components/Nodes";
import Chains from "./Chains";
import Chain from "./Chain";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<Header />}>
      <Route path="/" element={<Navigate to="/chains" />} />
      <Route path="/chains" element={<Chains />} />
      <Route path="/chains/:chainId" element={<Chain />} />
      <Route path="/chains/:chainId/activity" element={<Activity />} />
      <Route
        path="/chains/:chainId/block/:blockNumberOrHash"
        element={<BlockDetail />}
      />
      <Route
        path="/chains/:chainId/stats"
        element={<MiningStats />}
      />
      <Route
        path="/chains/:chainId/account/:accountId"
        element={<Account />}
      />
      <Route
        path="/chains/:chainId/nodes"
        element={<Nodes />}
      />
    </Route>
  ),
);

const App = () => <RouterProvider router={router} />;

export default App;
