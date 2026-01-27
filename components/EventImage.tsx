import React, { useState, useEffect } from 'react';
import { Image } from 'lucide-react';
import { getCachedImage, cacheImage } from '../services/imageCache';

interface EventImageProps {
  query: string;
  className?: string;
  alt: string;
}

export const EventImage: React.FC<EventImageProps> = ({ query, className, alt }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchImage = async () => {
      if (!query) {
        setLoading(false);
        setError(true);
        return;
      }

      // Check cache first
      const cached = getCachedImage(query);
      if (cached) {
        if (isMounted) {
          setImageUrl(cached);
          setLoading(false);
          setError(false);
        }
        return;
      }

      setLoading(true);
      setError(false);

      try {
        // Use Wikipedia Search Generator to find the best matching page's thumbnail
        const encodedQuery = encodeURIComponent(query);
        const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodedQuery}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=600&format=json&origin=*`;

        const res = await fetch(url);
        const data = await res.json();

        if (isMounted) {
          const pages = data?.query?.pages;
          if (pages) {
            const pageId = Object.keys(pages)[0];
            const source = pages[pageId]?.thumbnail?.source;
            if (source) {
              // Cache the successful result
              cacheImage(query, source);
              setImageUrl(source);
            } else {
              setError(true);
            }
          } else {
            setError(true);
          }
        }
      } catch (err) {
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchImage();

    return () => { isMounted = false; };
  }, [query]);

  if (loading) {
    return (
      <div className={`bg-stone-200 animate-pulse flex items-center justify-center ${className}`}>
        <Image className="w-6 h-6 text-stone-300" />
      </div>
    );
  }

  if (error || !imageUrl) {
    // Return placeholder pattern
    return (
      <div className={`bg-stone-200 flex items-center justify-center relative overflow-hidden ${className}`}>
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')]"></div>
        <Image className="w-8 h-8 text-stone-300 relative z-10" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-stone-100 ${className}`}>
      <img 
        src={imageUrl} 
        alt={alt} 
        className="w-full h-full object-cover transition-transform duration-700 hover:scale-110" 
        loading="lazy"
      />
      {/* Vignette overlay for historical feel */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_20px_rgba(43,38,34,0.3)]"></div>
    </div>
  );
};
