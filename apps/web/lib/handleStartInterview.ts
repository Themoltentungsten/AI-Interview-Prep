import { redirect } from 'next/navigation'; // Ensure this import

export const handleStartInterview = async (
  e: React.MouseEvent<HTMLButtonElement>,
  interviewType: string,
  interviewTitle: string
) => {
  e.preventDefault();
  
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/start-interview`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        interviewType,  // Send to backend (store in session/DB)
        interviewTitle
      }),
    });
    
    if (!response.ok) throw new Error('API failed');
    
  } catch (error) {
    console.error('Start interview failed:', error);
    // Optional: Show toast/error UI
  }
  
  // Redirect with params for client-side access
  redirect(`/waiting-room?type=${encodeURIComponent(interviewType)}&title=${encodeURIComponent(interviewTitle)}`);
};
