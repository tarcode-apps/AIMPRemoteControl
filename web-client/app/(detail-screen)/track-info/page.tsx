'use client';

import { Suspense } from 'react';
import { TrackInfoScreen } from './_components/TrackInfoScreen';

// The track comes from the address, which the static export only knows on the
// client.
export default function TrackInfo() {
    return (
        <Suspense>
            <TrackInfoScreen />
        </Suspense>
    );
}
