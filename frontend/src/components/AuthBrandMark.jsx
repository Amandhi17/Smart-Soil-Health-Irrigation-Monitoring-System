import React, { useId } from 'react';

/** AgriSmart monogram for auth screens */
export default function AuthBrandMark() {
    const uid = useId().replace(/:/g, '');
    const gradId = `authLeaf-${uid}`;

    return (
        <div className="auth-brand-mark" aria-hidden>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <path
                    d="M12 3c-4 4-6 8-6 12a6 6 0 1 0 12 0c0-4-2-8-6-12Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                    fill={`url(#${gradId})`}
                    fillOpacity="0.35"
                />
                <path
                    d="M12 9v6M9 12h6"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                />
                <defs>
                    <linearGradient id={gradId} x1="6" y1="3" x2="18" y2="21" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#6ee7b7" />
                        <stop offset="1" stopColor="#059669" />
                    </linearGradient>
                </defs>
            </svg>
        </div>
    );
}
