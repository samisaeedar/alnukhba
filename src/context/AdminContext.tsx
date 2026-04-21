import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { 
  UserProfile,  AdminUser,  ActivityLog,  InventoryLog,  
  AbandonedCart,  SearchTerm,  Visit,  SupportTicket, Transaction
} from '../types';
import { 
  db, collection, query, where, onSnapshot, getDocs, getDoc,
  setDoc, doc, updateDoc, deleteDoc, serverTimestamp, OperationType, handleFirestoreError, addDoc 
} from '../lib/firebase';
import { useStore } from './StoreContext';
import { getAdminDummyEmail } from '../lib/adminAuth';

interface AdminState {
  customers: UserProfile[];
  adminUsers: AdminUser[];
  activityLogs: ActivityLog[];
  inventoryLogs: InventoryLog[];
  abandonedCarts: AbandonedCart[];
  searchTerms: SearchTerm[];
  visits: Visit[];
  supportTickets: SupportTicket[];
}

interface AdminActions {
  addAdminUser: (admin: Omit<AdminUser, 'id'>) => void;
  updateAdminUser: (id: string, admin: Partial<AdminUser>, logDetails?: string) => void;
  deleteAdminUser: (id: string) => void;
  logActivity: (action: string, details: string) => void;
  updateCustomer: (phone: string, updates: Partial<UserProfile>) => void;
  blockCustomer: (phone: string) => void;
  addCustomer: (customer: UserProfile) => void;
  deleteCustomer: (phone: string) => void;
  updateCustomerBalance: (phone: string, amount: number, description: string) => void;
  addCustomerNote: (phone: string, note: string) => void;
}

const AdminContext = createContext<(AdminState & AdminActions) | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const { user, showToast } = useStore();

  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCart[]>([]);
  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);

  // Sync Admin-only Data
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      setCustomers([]);
      setActivityLogs([]);
      setAdminUsers([]);
      return;
    }

    const unsubCustomers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as unknown as UserProfile[];
      setCustomers(customersData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    const unsubLogs = onSnapshot(collection(db, 'activity_logs'), (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as unknown as ActivityLog[];
      setActivityLogs(logsData.sort((a, b) => {
        const dateA = (a.date as any)?.seconds ? (a.date as any).seconds : new Date(a.date).getTime();
        const dateB = (b.date as any)?.seconds ? (b.date as any).seconds : new Date(b.date).getTime();
        return dateB - dateA;
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'activity_logs'));

    const unsubAdmins = onSnapshot(collection(db, 'admin_users'), (snapshot) => {
      const adminsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as unknown as AdminUser[];
      setAdminUsers(adminsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'admin_users'));

    const unsubTickets = onSnapshot(collection(db, 'support_tickets'), (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as unknown as SupportTicket[];
      setSupportTickets(ticketsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'support_tickets'));

    const unsubVisits = onSnapshot(collection(db, 'visits'), (snapshot) => {
      const visitsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as unknown as Visit[];
      setVisits(visitsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'visits'));

    const unsubSearchTerms = onSnapshot(collection(db, 'searchTerms'), (snapshot) => {
      const termsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as unknown as SearchTerm[];
      setSearchTerms(termsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'searchTerms'));

    const unsubAbandonedCarts = onSnapshot(collection(db, 'abandonedCarts'), (snapshot) => {
      const cartsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as unknown as AbandonedCart[];
      setAbandonedCarts(cartsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'abandonedCarts'));

    const unsubInventoryLogs = onSnapshot(collection(db, 'inventory_logs'), (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as unknown as InventoryLog[];
      setInventoryLogs(logsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 1000));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'inventory_logs'));

    return () => {
      unsubCustomers();
      unsubLogs();
      unsubAdmins();
      unsubTickets();
      unsubVisits();
      unsubSearchTerms();
      unsubAbandonedCarts();
      unsubInventoryLogs();
    };
  }, [user]);

  const logActivity = useCallback(async (action: string, details: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'activity_logs'), {
        adminId: user.uid,
        adminName: user.name || user.displayName || 'مشرف',
        action,
        details,
        date: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  const addAdminUser = useCallback(async (adminObj: Omit<AdminUser, 'id'>) => {
    try {
      const newAdminRef = doc(collection(db, 'admin_users'));
      let finalAdmin = { ...adminObj };

      if (!finalAdmin.email && finalAdmin.phone && finalAdmin.countryCode) {
        finalAdmin.email = getAdminDummyEmail(finalAdmin.phone, finalAdmin.countryCode);
      }

      await setDoc(newAdminRef, {
        ...finalAdmin,
        id: newAdminRef.id,
        createdAt: serverTimestamp()
      });
      showToast('تم إضافة المشرف بنجاح');
      logActivity('إضافة مشرف', `تم إضافة مشرف جديد: ${finalAdmin.name}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'admin_users');
    }
  }, [showToast, logActivity]);

  const updateAdminUser = useCallback(async (id: string, updatedData: Partial<AdminUser>, logDetails?: string) => {
    try {
      let finalData = { ...updatedData };

      if (finalData.phone && finalData.countryCode && !finalData.email) {
        finalData.email = getAdminDummyEmail(finalData.phone, finalData.countryCode);
      }

      await updateDoc(doc(db, 'admin_users', id), {
        ...finalData,
        updatedAt: serverTimestamp()
      });

      try {
        const dummyEmail = finalData.email || getAdminDummyEmail(finalData.phone || '', finalData.countryCode || '+967');
        const usersQuery = query(collection(db, 'users'), where('email', '==', dummyEmail));
        const userDocs = await getDocs(usersQuery);
        if (userDocs && !userDocs.empty) {
          const userDocRef = doc(db, 'users', userDocs.docs[0].id);
          const updatesToUser: any = {};
          if (finalData.name) updatesToUser.adminName = finalData.name;
          if (finalData.role) {
            updatesToUser.adminRole = finalData.role;
            updatesToUser.role = 'admin';
          }
          if (finalData.phone) updatesToUser.phone = finalData.phone;
          
          if (Object.keys(updatesToUser).length > 0) {
            await updateDoc(userDocRef, updatesToUser);
          }
        }
      } catch (syncError) {
        console.error('Failed to sync admin details:', syncError);
      }

      showToast('تم تحديث بيانات المشرف');
      if (logDetails) logActivity('تحديث مشرف', logDetails);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `admin_users/${id}`);
    }
  }, [showToast, logActivity]);

  const deleteAdminUser = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'admin_users', id));
      showToast('تم حذف المشرف');
      logActivity('حذف مشرف', `تم حذف المشرف ID: ${id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `admin_users/${id}`);
    }
  }, [showToast, logActivity]);

  const updateCustomer = useCallback(async (identifier: string, updates: Partial<UserProfile>) => {
    try {
      if (!identifier) return showToast('معرف العميل غير صالح', 'error');

      let docRef = null;
      const uidRef = doc(db, 'users', identifier);
      const uidSnap = await getDoc(uidRef);

      if (uidSnap.exists()) {
        docRef = uidRef;
      } else {
        const q = query(collection(db, 'users'), where('phone', '==', identifier));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          docRef = snapshot.docs[0].ref;
        }
      }

      if (!docRef) return showToast('العميل غير موجود', 'error');

      await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() } as any);

      if (updates.password) {
        try {
          const snap = await getDoc(docRef);
          const userData = snap.data() as UserProfile | undefined;
          if (userData && userData.phone) {
             const resetResponse = await fetch('/api/reset-password', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                 phone: userData.phone,
                 countryCode: userData.countryCode || '+967',
                 newPassword: updates.password
               })
             });
             const resetData = await resetResponse.json();
             if (!resetResponse.ok || !resetData.success) {
               return showToast('تم التحديث لكن لم تتغير كلمة المرور', 'error');
             }
          }
        } catch (e) {
          console.error(e);
        }
      }
      showToast('تم تحديث بيانات العميل بنجاح');
      logActivity('تحديث عميل', `تم تحديث عميل: ${identifier}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users: ${identifier}`);
    }
  }, [showToast, logActivity]);

  const blockCustomer = useCallback(async (identifier: string) => {
    try {
      if (!identifier) return showToast('معرف العميل غير صالح', 'error');
      
      let docRef = null;
      let userData = null;
      
      const uidRef = doc(db, 'users', identifier);
      const uidSnap = await getDoc(uidRef);
      
      if (uidSnap.exists()) {
        docRef = uidRef;
        userData = uidSnap.data() as UserProfile;
      } else {
        const q = query(collection(db, 'users'), where('phone', '==', identifier));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          docRef = snapshot.docs[0].ref;
          userData = snapshot.docs[0].data() as UserProfile;
        }
      }

      if (!docRef || !userData) return showToast('العميل غير موجود', 'error');
      
      await updateDoc(docRef, { isBlocked: !userData.isBlocked, updatedAt: serverTimestamp() } as any);
      showToast('تم تغيير حالة حظر العميل');
      logActivity('تغيير حالة حظر', `تم تغيير حالة حظر عميل: ${identifier}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users (block): ${identifier}`);
    }
  }, [showToast, logActivity]);

  const addCustomer = useCallback(async (customer: UserProfile) => {
    try {
      const q = query(collection(db, 'users'), where('phone', '==', customer.phone));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) return showToast('الرقم مسجل مسبقاً', 'error');
      
      const newUserRef = doc(collection(db, 'users'));
      await setDoc(newUserRef, { ...customer, uid: newUserRef.id, createdAt: serverTimestamp() });
      showToast('تم إضافة العميل بنجاح');
      logActivity('إضافة عميل', `تم إضافة عميل جديد: ${customer.displayName || customer.name}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    }
  }, [showToast, logActivity]);

  const deleteCustomer = useCallback(async (identifier: string) => {
    try {
      if (!identifier) return showToast('معرف العميل غير صالح', 'error');
      
      let docRef = null;
      const uidRef = doc(db, 'users', identifier);
      const uidSnap = await getDoc(uidRef);
      
      if (uidSnap.exists()) {
        docRef = uidRef;
      } else {
        const q = query(collection(db, 'users'), where('phone', '==', identifier));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) docRef = snapshot.docs[0].ref;
      }
      if (!docRef) return showToast('العميل غير موجود', 'error');
      
      await deleteDoc(docRef);
      showToast('تم حذف العميل بنجاح');
      logActivity('حذف عميل', `تم حذف العميل: ${identifier}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users: ${identifier}`);
    }
  }, [showToast, logActivity]);

  const updateCustomerBalance = useCallback(async (identifier: string, amount: number, description: string) => {
    try {
      if (!identifier) return showToast('معرف العميل غير صالح', 'error');

      let docRef = null;
      let userData = null;

      const uidRef = doc(db, 'users', identifier);
      const uidSnap = await getDoc(uidRef);

      if (uidSnap.exists()) {
        docRef = uidRef;
        userData = uidSnap.data() as UserProfile;
      } else {
        const q = query(collection(db, 'users'), where('phone', '==', identifier));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          docRef = snapshot.docs[0].ref;
          userData = snapshot.docs[0].data() as UserProfile;
        }
      }

      if (!docRef || !userData) return showToast('العميل غير موجود', 'error');

      const newBalance = (userData.walletBalance || 0) + amount;
      const transaction: Transaction = {
        id: crypto.randomUUID(),
        amount: Math.abs(amount),
        type: amount >= 0 ? 'deposit' : 'withdrawal',
        date: new Date().toISOString(),
        status: 'completed',
        description
      };

      await updateDoc(docRef, {
        walletBalance: newBalance,
        transactions: [transaction, ...(userData.transactions || [])],
        updatedAt: serverTimestamp()
      } as any);

      showToast(amount >= 0 ? 'تم إضافة الرصيد بنجاح' : 'تم خصم الرصيد بنجاح');
      logActivity('تحديث رصيد', `تحديث رصيد العميل ${identifier} بمقدار ${amount}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users (balance): ${identifier}`);
    }
  }, [showToast, logActivity]);

  const addCustomerNote = useCallback(async (identifier: string, text: string) => {
    try {
      if (!identifier) return showToast('معرف العميل غير صالح', 'error');

      let docRef = null;
      let userData = null;

      const uidRef = doc(db, 'users', identifier);
      const uidSnap = await getDoc(uidRef);

      if (uidSnap.exists()) {
        docRef = uidRef;
        userData = uidSnap.data() as UserProfile;
      } else {
        const q = query(collection(db, 'users'), where('phone', '==', identifier));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          docRef = snapshot.docs[0].ref;
          userData = snapshot.docs[0].data() as UserProfile;
        }
      }

      if (!docRef || !userData) return showToast('العميل غير موجود', 'error');

      const currentNotes = userData.notes || [];
      await updateDoc(docRef, {
        notes: [...currentNotes, { id: Date.now().toString(), text, date: new Date().toISOString(), addedBy: user?.name || 'Admin' }]
      } as any);
      
      showToast('تم إضافة الملاحظة');
    } catch (error) {
      console.error(error);
    }
  }, [showToast, user]);

  return (
    <AdminContext.Provider value={{
      customers,
      adminUsers,
      activityLogs,
      inventoryLogs,
      abandonedCarts,
      searchTerms,
      visits,
      supportTickets,
      addAdminUser,
      updateAdminUser,
      deleteAdminUser,
      logActivity,
      updateCustomer,
      blockCustomer,
      addCustomer,
      deleteCustomer,
      updateCustomerBalance,
      addCustomerNote
    }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdminStore() {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdminStore must be used within an AdminProvider');
  }
  return context;
}
