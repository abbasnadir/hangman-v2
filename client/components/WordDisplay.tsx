'use client';

export const WordDisplay = ({
  wordArr,
  wordCount
}: {
  wordArr: (string | '_' | ' ')[];
  wordCount: string[];
}) => (
  <div className="my-8">
    <h1 className="text-3xl md:text-5xl text-center font-bold tracking-widest text-black dark:text-white drop-shadow-md">
      {wordArr.map((c, i) => (
        <span className="mr-4" key={i}>
          {c === ' ' ? '\u00A0\u00A0' : c === '_' ? '_' : c}
        </span>
      ))}
    </h1>
    <div className="flex justify-around text-xl sm:text-2xl font-bold text-gray-700 dark:text-gray-300 mt-4 opacity-70">
      {wordCount.map((c, i) => (
        <span key={i} className="flex justify-center" style={{ width: `${c.length * 2 - 1}ch` }}>
          {c.length}
        </span>
      ))}
    </div>
  </div>
);
