import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../lib/error-message.js';

/** Shared submit/error/loading state for the small auth and settings forms. */
export function useFormAction(action: () => Promise<void>) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  return { error, isSubmitting, onSubmit, setError };
}
