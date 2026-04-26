import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api.js";

export function useApiData(path, token, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setData(await api(path, { token }));
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [path, token, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, setData, error, loading, reload: load };
}
