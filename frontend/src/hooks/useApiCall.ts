import { useState, useCallback } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

// Custom hook for API request state management
export function useApiCall<T>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const toast = useToast();

  const execute = useCallback(
    async (
      apiCall: () => Promise<T>,
      options?: {
        onSuccess?: (data: T) => void;
        onError?: (error: ApiError) => void;
        showSuccessToast?: boolean;
        showErrorToast?: boolean;
        successMessage?: string;
      }
    ) => {
      try {
        setLoading(true);
        setError(null);

        const result = await apiCall();
        setData(result);

        if (options?.onSuccess) {
          options.onSuccess(result);
        }

        if (options?.showSuccessToast && options?.successMessage) {
          toast.success(options.successMessage);
        }

        return result;
      } catch (err) {
        const apiError =
          err instanceof ApiError
            ? err
            : new ApiError("An unexpected error occurred", 500);
        setError(apiError);

        if (options?.onError) {
          options.onError(apiError);
        }

        if (options?.showErrorToast !== false) {
          toast.error(apiError.message);
        }

        throw apiError;
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    execute,
    reset,
  };
}

// Hook specifically for paginated data
export function usePaginatedApiCall<T>() {
  const [data, setData] = useState<T[]>([]);
  interface PaginationState {
    page: number;
    totalPages: number;
    totalItems: number;
    limit: number;
  }
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    totalPages: 1,
    totalItems: 0,
    limit: 10,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const toast = useToast();

  const execute = useCallback(
    async (
      apiCall: () => Promise<{ data: T[]; pagination: PaginationState }>,
      options?: {
        append?: boolean;
        onSuccess?: (data: T[], pagination: PaginationState) => void;
        onError?: (error: ApiError) => void;
        showErrorToast?: boolean;
      }
    ) => {
      try {
        setLoading(true);
        setError(null);

        const result = await apiCall();

        if (options?.append) {
          setData((prev) => [...prev, ...result.data]);
        } else {
          setData(result.data);
        }

        setPagination(result.pagination);

        if (options?.onSuccess) {
          options.onSuccess(result.data, result.pagination);
        }

        return result;
      } catch (err) {
        const apiError =
          err instanceof ApiError
            ? err
            : new ApiError("An unexpected error occurred", 500);
        setError(apiError);

        if (options?.onError) {
          options.onError(apiError);
        }

        if (options?.showErrorToast !== false) {
          toast.error(apiError.message);
        }

        throw apiError;
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const reset = useCallback(() => {
    setData([]);
    setPagination({ page: 1, totalPages: 1, totalItems: 0, limit: 10 });
    setError(null);
    setLoading(false);
  }, []);

  const loadMore = useCallback(
    (apiCall: () => Promise<{ data: T[]; pagination: typeof pagination }>) => {
      if (pagination.page < pagination.totalPages && !loading) {
        return execute(apiCall, { append: true });
      }
    },
    [execute, pagination, loading]
  );

  return {
    data,
    pagination,
    loading,
    error,
    execute,
    reset,
    loadMore,
    hasMore: pagination.page < pagination.totalPages,
  };
}

// Hook for handling form submissions with API calls
export function useApiForm<T, U>() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const toast = useToast();

  const submit = useCallback(
    async (
      formData: T,
      apiCall: (data: T) => Promise<U>,
      options?: {
        onSuccess?: (result: U) => void;
        onError?: (error: ApiError) => void;
        successMessage?: string;
        resetForm?: () => void;
      }
    ) => {
      try {
        setSubmitting(true);
        setError(null);

        const result = await apiCall(formData);

        if (options?.onSuccess) {
          options.onSuccess(result);
        }

        if (options?.successMessage) {
          toast.success(options.successMessage);
        }

        if (options?.resetForm) {
          options.resetForm();
        }

        return result;
      } catch (err) {
        const apiError =
          err instanceof ApiError
            ? err
            : new ApiError("An unexpected error occurred", 500);
        setError(apiError);

        if (options?.onError) {
          options.onError(apiError);
        } else {
          toast.error(apiError.message);
        }

        throw apiError;
      } finally {
        setSubmitting(false);
      }
    },
    [toast]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    submitting,
    error,
    submit,
    clearError,
  };
}

// Hook for optimistic updates
export function useOptimisticUpdate<T>() {
  const [optimisticData, setOptimisticData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const executeWithOptimisticUpdate = useCallback(
    async (
      currentData: T,
      optimisticUpdate: (data: T) => T,
      apiCall: () => Promise<T>,
      options?: {
        onSuccess?: (data: T) => void;
        onError?: (error: ApiError) => void;
        successMessage?: string;
      }
    ) => {
      try {
        // Apply optimistic update immediately
        const optimisticResult = optimisticUpdate(currentData);
        setOptimisticData(optimisticResult);
        setLoading(true);

        // Execute API call
        const result = await apiCall();

        // Update with real data
        setOptimisticData(null);

        if (options?.onSuccess) {
          options.onSuccess(result);
        }

        if (options?.successMessage) {
          toast.success(options.successMessage);
        }

        return result;
      } catch (err) {
        // Revert optimistic update on error
        setOptimisticData(null);

        const apiError =
          err instanceof ApiError
            ? err
            : new ApiError("An unexpected error occurred", 500);

        if (options?.onError) {
          options.onError(apiError);
        } else {
          toast.error(apiError.message);
        }

        throw apiError;
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  return {
    optimisticData,
    loading,
    executeWithOptimisticUpdate,
  };
}
