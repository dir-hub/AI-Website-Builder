import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

const Settings = () => {
    const navigate = useNavigate()
    const { data: session } = authClient.useSession()
    const user = session?.user

    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmValue, setConfirmValue] = useState("")

    const [isSavingName, setIsSavingName] = useState(false)
    const [isSavingPassword, setIsSavingPassword] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    useEffect(() => {
        if (!user) return
        setName(user.name || "")
        setEmail(user.email || "")
    }, [user])

    const isConfirmValid = useMemo(() => confirmValue.trim() === "DELETE", [confirmValue])
    const canSavePassword = useMemo(
        () => currentPassword.trim().length > 0 && newPassword.trim().length >= 8,
        [currentPassword, newPassword]
    )

    const parsePayload = async (response: Response) => {
        try {
            return await response.json() as Record<string, unknown>
        } catch {
            return null
        }
    }

    const handleSaveName = async () => {
        if (!name.trim() || isSavingName) return
        setIsSavingName(true)
        try {
            const response = await fetch(`${import.meta.env.VITE_BASEURL}/api/auth/update-user`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
            })
            const payload = await parsePayload(response)
            if (!response.ok) {
                throw new Error(typeof payload?.message === "string" ? payload.message : "Failed to update name.")
            }
            toast.success("Name updated.")
            window.location.reload()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update name.")
        } finally {
            setIsSavingName(false)
        }
    }

    const handleChangePassword = async () => {
        if (!canSavePassword || isSavingPassword) return
        setIsSavingPassword(true)
        try {
            const response = await fetch(`${import.meta.env.VITE_BASEURL}/api/auth/change-password`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    currentPassword: currentPassword.trim(),
                    newPassword: newPassword.trim(),
                    revokeOtherSessions: true,
                }),
            })
            const payload = await parsePayload(response)
            if (!response.ok) {
                throw new Error(typeof payload?.message === "string" ? payload.message : "Failed to change password.")
            }
            setCurrentPassword("")
            setNewPassword("")
            toast.success("Password changed successfully.")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to change password.")
        } finally {
            setIsSavingPassword(false)
        }
    }

    const handleDeleteAccount = async () => {
        if (!isConfirmValid || isDeleting) return

        setIsDeleting(true)
        try {
            const response = await fetch(`${import.meta.env.VITE_BASEURL}/api/auth/delete-user`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            })

            const payload = await parsePayload(response)

            if (!response.ok) {
                const message =
                    typeof payload?.message === "string"
                        ? payload.message
                        : "Unable to delete account."
                throw new Error(message)
            }

            toast.success("Account deleted successfully.")
            navigate("/auth/sign-in", { replace: true })
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to delete account."
            toast.error(message)
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <div className="w-full p-4 flex justify-center items-center min-h-[90vh] flex-col gap-6 py-12">
            <section className="bg-black/10 ring ring-indigo-950 max-w-xl w-full mx-auto rounded-lg border-none overflow-hidden">
                <div className="pt-6 px-6 pb-4">
                    <h2 className="md:text-2xl text-xl font-bold text-white">Name</h2>
                    <p className="md:text-sm text-xs text-white/80 mt-2">Update your display name.</p>
                </div>
                <div className="px-6 pb-4">
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Your name"
                        className="w-full h-10 rounded-md bg-transparent ring ring-indigo-900/80 px-3 text-white outline-none"
                    />
                </div>
                <div className="bg-black/10 ring ring-indigo-950 pt-2 pb-2 px-6 rounded-b-lg border-b-none flex justify-end">
                    <Button
                        onClick={handleSaveName}
                        disabled={!name.trim() || isSavingName}
                        className="disabled:pointer-events-auto disabled:cursor-not-allowed"
                    >
                        {isSavingName ? "Updating..." : "Update"}
                    </Button>
                </div>
            </section>

            <div className="w-full">
                <section className="bg-black/10 ring ring-indigo-950 max-w-xl mx-auto rounded-lg border-none overflow-hidden">
                    <div className="pt-6 px-6 pb-4">
                        <h2 className="md:text-2xl text-xl font-bold text-white">Email</h2>
                        <p className="md:text-sm text-xs text-white/80 mt-2">Your email address associated with your account..</p>
                    </div>
                    <div className="px-6 pb-4">
                        <input
                            value={email} disabled
                            placeholder="you@example.com"
                            className="w-full h-10 rounded-md bg-transparent ring ring-indigo-900/80 px-3 text-white outline-none disabled:cursor-not-allowed"
                        />
                    </div>
                    
                </section>
            </div>

            <div className="w-full">
                <section className="bg-black/10 ring ring-indigo-950 max-w-xl mx-auto rounded-lg border-none overflow-hidden">
                    <div className="pt-6 px-6 pb-4">
                        <h2 className="md:text-2xl text-xl font-bold text-white">Change Password</h2>
                        <p className="md:text-sm text-xs text-white/80 mt-2">Use your current password to set a new one.</p>
                    </div>
                    <div className="px-6 pb-4 grid gap-3">
                        <input
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                            type="password"
                            placeholder="Current password"
                            className="w-full h-10 rounded-md bg-transparent ring ring-indigo-900/80 px-3 text-white outline-none"
                        />
                        <input
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            type="password"
                            placeholder="New password (min 8 chars)"
                            className="w-full h-10 rounded-md bg-transparent ring ring-indigo-900/80 px-3 text-white outline-none"
                        />
                    </div>
                    <div className="bg-black/10 ring ring-indigo-950 pt-2 pb-2 px-6 rounded-b-lg border-b-none flex justify-end ">
                        <Button
                            onClick={handleChangePassword}
                            disabled={!canSavePassword || isSavingPassword}
                            className="disabled:pointer-events-auto disabled:cursor-not-allowed"
                        >
                            {isSavingPassword ? "Updating..." : "Update"}
                        </Button>
                    </div>
                </section>
            </div>

            <div className="w-full">
                <section className="bg-black/10 ring ring-indigo-950 max-w-xl mx-auto rounded-lg border-none overflow-hidden">
                    <div className="pt-6 px-6 pb-4">
                        <h2 className="md:text-2xl text-xl font-bold text-white">Delete Account</h2>
                        <p className="md:text-sm text-xs text-white/80 mt-2">
                            This action is permanent. Type <span className="font-semibold">DELETE</span> to confirm.
                        </p>
                    </div>
                    <div className="px-6 pb-4 grid gap-3">
                        <input
                            value={confirmValue}
                            onChange={(event) => setConfirmValue(event.target.value)}
                            placeholder="Type DELETE to confirm"
                            className="w-full h-10 rounded-md bg-transparent ring ring-indigo-900/80 px-3 text-white outline-none"
                        />
                    </div>
                    <div className="bg-black/10 ring ring-indigo-950 pt-2 pb-2 px-6 rounded-b-lg border-b-none flex justify-end">
                        <Button
                            onClick={handleDeleteAccount}
                            disabled={!isConfirmValid || isDeleting}
                            className="rounded-full bg-red-600 text-white hover:bg-red-500 disabled:bg-red-900/60 disabled:text-white/70 disabled:pointer-events-auto disabled:cursor-not-allowed"
                        >
                            {isDeleting ? "Deleting..." : "Delete Account"}
                        </Button>
                    </div>
                </section>
            </div>
        </div>
    )
}

export default Settings