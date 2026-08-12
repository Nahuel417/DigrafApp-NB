'use client';

import { useEffect, useState } from 'react';

import { getOrderDesignImageReadUrlAction } from '@/features/orders/image-actions';

type ThumbnailState = 'idle' | 'loading' | 'ready' | 'error';

function makeFormData(orderId: string) {
    const formData = new FormData();
    formData.set('orderId', orderId);
    return formData;
}

export function OrderDesignThumbnail({
    alt,
    className,
    imageUpdatedAt,
    onActivate,
    onUrlReady,
    orderId,
}: {
    alt: string;
    className?: string;
    imageUpdatedAt: string | null;
    onActivate?: (trigger: HTMLButtonElement) => void;
    onUrlReady?: (url: string) => void;
    orderId: string;
}) {
    const [state, setState] = useState<ThumbnailState>('loading');
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const maxRetries = 2;

    useEffect(() => {
        let cancelled = false;
        getOrderDesignImageReadUrlAction({}, makeFormData(orderId))
            .then((result) => {
                if (cancelled) return;
                if (result.status === 'success' && result.image) {
                    setSignedUrl(result.image.signedUrl);
                    onUrlReady?.(result.image.signedUrl);
                    setState('ready');
                } else {
                    setState('error');
                }
            })
            .catch(() => {
                if (!cancelled) setState('error');
            });
        return () => {
            cancelled = true;
        };
    }, [imageUpdatedAt, onUrlReady, orderId]);

    function handleImageError() {
        if (retryCount < maxRetries) {
            setRetryCount((count) => count + 1);
            setState('loading');
            getOrderDesignImageReadUrlAction({}, makeFormData(orderId))
                .then((result) => {
                    if (result.status === 'success' && result.image) {
                        setSignedUrl(result.image.signedUrl);
                        onUrlReady?.(result.image.signedUrl);
                        setState('ready');
                    } else {
                        setState('error');
                    }
                })
                .catch(() => setState('error'));
        } else {
            setState('error');
        }
    }

    if (state === 'idle' || state === 'loading') {
        return <div aria-hidden="true" className={`overflow-hidden rounded-md bg-muted animate-pulse ${className ?? 'aspect-[4/3]'}`} />;
    }

    if (state === 'error' || !signedUrl) {
        return null;
    }

    const image = (
        <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={alt} className="size-full object-cover" key={signedUrl} loading="lazy" onError={handleImageError} referrerPolicy="no-referrer" role="img" src={signedUrl} />
        </>
    );

    if (onActivate) {
        return (
            <button
                aria-label={`Abrir ${alt.toLowerCase()}`}
                className={`block cursor-zoom-in overflow-hidden rounded-md bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className ?? 'aspect-[4/3]'}`}
                onClick={(event) => onActivate(event.currentTarget)}
                type="button">
                {image}
            </button>
        );
    }

    return <div className={`overflow-hidden rounded-md bg-muted ${className ?? 'aspect-[4/3]'}`}>{image}</div>;
}
