import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Project } from '../types';
import { ArrowBigDownDashIcon, EyeIcon, EyeOffIcon, FullscreenIcon, LaptopIcon, Loader2Icon, MessageSquareIcon, SaveIcon, SmartphoneIcon, TabletIcon, XIcon } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ProjectPreview, { type ProjectPreviewRef } from '../components/ProjectPreview';
import api from '@/configs/axios';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';

const Projects = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const {data: session, isPending} = authClient.useSession();

  const [credits, setCredits] = useState<number>(0);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const getCredits = async () => {
    try {
      const { data } = await api.get('/api/user/credits')
      setCredits(data.credits)
    } catch (error: any) {
      console.log(error)
    }
  }

  const [isGenerating, setIsGenerating] = useState(true);
  const [device, setDevice] = useState<'desktop' | 'phone' | 'tablet'>('desktop');

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const previewRef = useRef<ProjectPreviewRef>(null);

  const fetchProject = async (showLoader = false) => {
   try {
    if (showLoader) setLoading(true);
    // Fetch project data
    const { data } = await api.get(`/api/user/project/${projectId}`);
    
    // Check if we should stop generating
    const lastMsg = data.project.conversation[data.project.conversation.length - 1];
    
    // Assistant is still working if the last message is one of these "starting" messages
    const isAssistantWorking = lastMsg?.role === 'assistant' && 
        (lastMsg?.content === 'Now generating your website...' || 
         lastMsg?.content.toLowerCase().startsWith('enhanced prompt:') ||
         lastMsg?.content.toLowerCase().includes('prompt enhancement is unavailable'));

    // Detect errors or failures in the conversation
    const hasAssistantError = data.project.conversation.some((c: any) => 
        c.role === 'assistant' && 
        (c.content.toLowerCase().includes('failed') || 
         c.content.toLowerCase().includes('busy') || 
         c.content.toLowerCase().includes('error') ||
         c.content.toLowerCase().includes('timed out'))
    );

    const isNewVersion = project && data.project.current_version_index !== project.current_version_index;
    const isInitialLoadFinished = !project && data.project.current_code;

    // Detect if a revision was just started by the user but not yet reflected in server data
    // We check if our local state has more messages than the server
    const isLocalAhead = project && project.conversation.length > data.project.conversation.length;

    // CRITICAL LOGIC: 
    // 1. If there's an error message, STOP loading.
    // 2. If the AI is working (enhancing OR generating), KEEP loading.
    // 3. If we are locally ahead (optimistic message), KEEP loading.
    // 4. If we have a NEW version or initial load is done, STOP loading.
    if (hasAssistantError) {
        setIsGenerating(false);
    } else if (isAssistantWorking || isLocalAhead) {
        setIsGenerating(true);
    } else if (isGenerating && (isNewVersion || isInitialLoadFinished)) {
        setIsGenerating(false);
    }

    // Only update project if the server has the latest conversation or we aren't generating
    // This prevents the "disappearing message" bug and ensures immediate state sync
    if (!isLocalAhead || hasAssistantError || isNewVersion) {
        setProject(data.project);
    }
   } catch (error: any) {
    toast.error(error?.response?.data?.message || error.message)
    console.error(error);
   } finally {
    if (showLoader) setLoading(false);
   }
  }
  const saveProject = async () => {
    if(!previewRef.current) return;
    const code = previewRef.current.getCode();
    if(!code) return;
    setIsSaving(true);
    try {
      const { data } = await api.put(`/api/project/save/${projectId}`, { code });
      toast.success(data.message);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error.message)
      console.log(error);
    } finally {
      setIsSaving(false);
    }
  }

  const downloadCode = async () => {
    const code = previewRef.current?.getCode() || project?.current_code;
    if(!code){
      if(isGenerating){
        return
      }
      return
    }
    const element = document.createElement("a");
    const file = new Blob([code], { type: 'text/html' });
    element.href = URL.createObjectURL(file);
    element.download = 'index.html';
    document.body.appendChild(element);
    element.click();
  }

  const togglePublish = async () =>{
    try {
      const { data } = await api.get(`/api/user/publish-toggle/${projectId}`);
      toast.success(data.message);
      setProject((prev)=>prev ? ({...prev, isPublished: !prev.isPublished}) : null)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error.message)
      console.log(error);
    } 
  }

  useEffect(() => {
    if(session?.user){
      fetchProject(true);
      getCredits();
    }else if(!isPending && !session?.user){
      navigate('/');
      toast.error('You need to be logged in to access this page');
    }
  }, [session?.user, isPending, navigate, projectId])


  useEffect(() => {
    // Polling should run if:
    // 1. We are explicitly in a generating state (isGenerating is true)
    // 2. The project exists but has no code yet (initial creation phase)
    // 3. We are in a project view and want to see real-time chat updates/revisions
    const shouldPoll = session?.user && projectId;
    
    if (shouldPoll) {
      const intervalId = setInterval(() => {
        fetchProject(false);
        // Only fetch credits if we're not actively generating to reduce lag
        if (!isGenerating) getCredits();
      }, 3000);
      return () => clearInterval(intervalId);
    }
  }, [isGenerating, projectId, session?.user, project?.current_version_index])

  if (loading) {
    return (
      <>
        <div className='flex items-center justify-center h-screen'>
          <Loader2Icon className='animate-spin text-indigo-200 size-7' />
        </div>
      </>
    )
  }


  return project ? (
    <div className='flex flex-col h-screen w-full bg-gray-900 text-white'>
      <div className='flex max-sm:flex-col sm:items-center gap-4 px-4 py-2 no-scrollbar'>
        <div className='flex items-center gap-2 sm:min-w-90 text-nowrap'>
          <img src="/favicon.svg" alt="logo" className='h-6 cursor-pointer' onClick={() => navigate('/')} />
          <div className='max-w-64 sm:max-w-xs'>
            <p className='text-sm text-medium capitalize truncate'>{project.name}</p>
            <p className='text-xs text-gray-400 -mt-0.5'>Previewing last saved version</p>
          </div>
          <div className='sm:hidden flex-1 flex justify-end'>
            {isMenuOpen ? <MessageSquareIcon onClick={() => setIsMenuOpen(false)} className='size-6 cursor-pointer' />
              : <XIcon className='size-6 cursor-pointer' onClick={() => setIsMenuOpen(true)} />}
          </div>
        </div>      
        <div className='hidden sm:flex gap-2 bg-gray-950 p-1.5 rounded-md'>
          <SmartphoneIcon onClick={() => setDevice('phone')} className={`size-6 p-1 rounded cursor-pointer ${device === 'phone' ? 'bg-gray-700' : ''}`} />
          <TabletIcon onClick={() => setDevice('tablet')} className={`size-6 p-1 rounded cursor-pointer ${device === 'tablet' ? 'bg-gray-700' : ''}`} />
          <LaptopIcon onClick={() => setDevice('desktop')} className={`size-6 p-1 rounded cursor-pointer ${device === 'desktop' ? 'bg-gray-700' : ''}`} />
        </div>
        <div className='flex items-center justify-end gap-3 flex-1 text-xs sm:text-sm'>
          <button className='bg-white/10 px-5 py-1.5 text-xs sm:text-sm border text-gray-200 rounded-full shrink-0 whitespace-nowrap'>Credits : <span className="text-indigo-300">{credits}</span></button>
          <button onClick={saveProject} disabled={isSaving} className='max-sm:hidden bg-gray-800 hover:bg-gray-700 text-white px-3.5 py-1 flex items-center gap-2 rounded sm:rounded-sm transition-colors border border-gray-700'>
            {isSaving ? <Loader2Icon className='animate-spin' size={16}/> : 
            <SaveIcon size={16} />}Save
  
          </button>
          <Link target='_blank' to={`/preview/${projectId}`} className='flex items-center gap-2 px-4 py-1 rounded sm:rounded-sm border
        border-gray-700 hover:border-gray-50 transition-colors'>
            <FullscreenIcon size={16} />  Preview
          </Link>
          <button onClick={downloadCode} className='bg-linear-to-br from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 text-white px-3.5 py-1 flex items-center gap-2 rounded sm:rounded-sm transition-colors'>
            <ArrowBigDownDashIcon size={16} /> Download
          </button>
          <button onClick={togglePublish} className='bg-linear-to-br from-indigo-700 to-indigo-600 hover:from-indigo-600 hover:to-indigo-500 text-white px-3.5 py-1 flex items-center gap-2 rounded sm:rounded-sm transition-colors'>
            {project.isPublished ?
              <EyeOffIcon size={16} /> : <EyeIcon size={16}
              />}
             {project.isPublished ? 'Private' : 'Public'}
          </button>
        </div>
      </div>
      <div className='flex-1 flex overflow-auto'>
              <Sidebar isMenuOpen={isMenuOpen} project={project} setProject={(p)=>setProject(p)} isGenerating={isGenerating} setIsGenerating={setIsGenerating}/>
              <div className='flex-1 p-2 pl-0'>
                <ProjectPreview ref={previewRef} project={project} device={device} isGenerating={isGenerating} showEditorPanel={!!project.current_code} />
              </div>
      </div>
    </div>
  )
    :
    (
      <div className='flex items-center justify-center h-screen'>
        <p className='text-2xl font-medium text-gray-200'>Unable to load project!</p>
      </div>
    )
}

export default Projects