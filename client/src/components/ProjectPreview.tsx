import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import type { Project } from '../types';
import { iframeScript } from '../assets/assets';
import EditorPanel from './EditorPanel';
import LoaderSteps from './LoaderSteps';

interface ProjectPreviewProps {
    project: Project;
    isGenerating: boolean;
    device?: 'desktop' | 'phone' | 'tablet';
    showEditorPanel?: boolean;
}

export interface ProjectPreviewRef {
    getCode: () => string | undefined;
}

const ProjectPreview = forwardRef<ProjectPreviewRef, ProjectPreviewProps>(({ project, isGenerating, device = 'desktop', showEditorPanel = true }, ref) => {

    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [selectedElement, setSelectedElement] = React.useState<any>(null)

    const resolutions = {
        phone: 'w-[412px]',
        tablet: 'w-[768px]',
        desktop: 'w-full'
    }

    useImperativeHandle(ref, () => ({
        getCode: () => {
            const doc = iframeRef.current?.contentDocument;
            if(!doc) return undefined;

            doc.querySelectorAll('.ai-selected-element,[data-ai-selected]').forEach(el => {
                el.removeAttribute('data-ai-selected');
                el.classList.remove('ai-selected-element');
                (el as HTMLElement).style.outline = '';
            })

            const previewStyle = doc.getElementById('ai-preview-style');
            if(previewStyle){
                previewStyle.remove();
            }

            const previewScript = doc.getElementById('ai-preview-script');
            if(previewScript){
                previewScript.remove();
            }

            const html = doc.documentElement.outerHTML;
            return html;
        }
    }), [])

    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if(event.data.type === 'ELEMENT_SELECTED'){
                setSelectedElement(event.data.payload);
            }else if(event.data.type === 'CLEAR_SELECTION'){
                setSelectedElement(null);
            }
        }
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        }
    }, [])

    const handleUpdate = (updates : any) => {
        if(iframeRef.current?.contentWindow){
            iframeRef.current.contentWindow.postMessage({type:'UPDATE_ELEMENT', payload: updates}, '*');
        }
    }

    const injectPreview = (html: string) => {
        if(!html || html === 'loading...') return '';
        if(!showEditorPanel){
            return html;
        }
        if(html.includes('<body>')){
            return html.replace('</body>', iframeScript + '</body>');
        }else{
            return html + iframeScript;
        }
    }
    const hasFailed = !isGenerating && !project.current_code && project.conversation.some(c => c.role === 'assistant' && (c.content.includes('failed') || c.content.includes('busy') || c.content.includes('error')));

    return (
        <div className='relative h-full bg-gray-900 flex-1 rounded-xl overflow-hidden max-sm:ml-2'>
            {isGenerating ? (
                <div className='flex items-center justify-center h-full bg-gray-950'>
                    <LoaderSteps />
                </div>
            ) : project.current_code ? (
                <>
                    <iframe ref={iframeRef} srcDoc={injectPreview(project.current_code)} className={`h-full max-sm:w-full ${resolutions[device]} mx-auto transition-all`} />
                    {showEditorPanel && selectedElement && (
                        <EditorPanel selectedElement={selectedElement} onUpdate={handleUpdate} onClose={() => {
                            setSelectedElement(null);
                            if (iframeRef.current?.contentWindow) {
                                iframeRef.current.contentWindow.postMessage({ type: 'CLEAR_SELECTION_REQUEST' }, '*')
                            }
                        }} />
                    )}
                </>
            ) : hasFailed ? (
                <div className='flex flex-col items-center justify-center h-full text-center p-6'>
                    <div className='bg-red-500/10 p-4 rounded-full mb-4'>
                        <svg className='w-12 h-12 text-red-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
                        </svg>
                    </div>
                    <h3 className='text-xl font-semibold text-white mb-2'>Generation Failed</h3>
                    <p className='text-gray-400 max-w-md'>
                        We encountered an issue while creating your website. Please check the chat for details and try again by sending a new request.
                    </p>
                </div>
            ) : (
                <div className='flex items-center justify-center h-full'>
                    <p className='text-gray-400 animate-pulse'>Loading preview...</p>
                </div>
            )}
        </div>
    )
})

export default ProjectPreview  