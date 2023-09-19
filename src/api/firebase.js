import {
	collection,
	onSnapshot,
	addDoc,
	getDocs,
	doc,
	updateDoc,
	orderBy,
	query,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './config';
import { getFutureDate, getDaysBetweenDates } from '../utils';
import { calculateEstimate } from '@the-collab-lab/shopping-list-utils';

/**
 * A custom hook that subscribes to a shopping list in our Firestore database
 * and returns new data whenever the list changes.
 * @param {string | null} listId
 * @see https://firebase.google.com/docs/firestore/query-data/listen
 */
export function useShoppingListData(listId) {
	// Start with an empty array for our data.
	/** @type {import('firebase/firestore').DocumentData[]} */
	const initialState = [];
	const [data, setData] = useState(initialState);

	useEffect(() => {
		if (!listId) return;

		// When we get a listId, we use it to subscribe to real-time updates
		// from Firestore.
		return onSnapshot(collection(db, listId), (snapshot) => {
			// The snapshot is a real-time update. We iterate over the documents in it
			// to get the data.
			const nextData = snapshot.docs.map((docSnapshot) => {
				// Extract the document's data from the snapshot.
				const item = docSnapshot.data();

				// The document's id is not in the data,
				// but it is very useful, so we add it to the data ourselves.
				item.id = docSnapshot.id;

				return item;
			});

			// Update our React state with the new data.
			setData(nextData);
		});
	}, [listId]);

	// Return the data so it can be used by our React components.
	return data;
}

/**
 * Add a new item to the user's list in Firestore.
 * @param {string} listId The id of the list we're adding to.
 * @param {Object} itemData Information about the new item.
 * @param {string} itemData.itemName The name of the item.
 * @param {number} itemData.daysUntilNextPurchase The number of days until the user thinks they'll need to buy the item again.
 */
export async function addItem(listId, { itemName, daysUntilNextPurchase }) {
	const listCollectionRef = collection(db, listId);

	// Firebase function, so this information is sent to your database!
	return addDoc(listCollectionRef, {
		dateCreated: new Date(),
		// NOTE: This is null because the item has just been created.
		// We'll use updateItem to put a Date here when the item is purchased!
		dateLastPurchased: null,
		dateNextPurchased: getFutureDate(daysUntilNextPurchase),
		name: itemName,
		totalPurchases: 0,
	});
}

export async function updateItem(
	listId,
	itemId,
	dateLastPurchased,
	dateNextPurchased,
	dateCreated,
	currentItemUpdates,
) {
	const currentItemRef = doc(db, listId, itemId);
	const { totalPurchases } = currentItemUpdates;
	let daysSinceLastTransaction;
	let previousEstimate;
	if (totalPurchases === 1) {
		daysSinceLastTransaction = getDaysBetweenDates(
			dateCreated.toDate(),
			new Date(),
		);
	} else {
		previousEstimate = getDaysBetweenDates(
			dateLastPurchased.toDate(),
			dateNextPurchased.toDate(),
		);
		daysSinceLastTransaction = getDaysBetweenDates(
			dateLastPurchased.toDate(),
			new Date(),
		);
	}
	const numberOfDays = calculateEstimate(
		previousEstimate,
		daysSinceLastTransaction,
		totalPurchases,
	);

	const estimatedNextPurchaseDate = getFutureDate(numberOfDays);

	try {
		await updateDoc(currentItemRef, {
			...currentItemUpdates,
			dateNextPurchased: estimatedNextPurchaseDate,
		});
	} catch (error) {
		console.error('Unable to update item:', error.message);
	}
}

export async function deleteItem() {
	/**
	 * TODO: Fill this out so that it uses the correct Firestore function
	 * to delete an existing item. You'll need to figure out what arguments
	 * this function must accept!
	 */
}

export async function createNewList(listId) {
	let response;
	try {
		response = await addDoc(collection(db, listId), {});
	} catch (error) {
		console.error('Error creating grocery list: ', error);
		return 'error';
	}
	return response;
}

export async function checkIfListExists(listId) {
	const listCollectionRef = collection(db, listId);

	try {
		const querySnapshot = await getDocs(listCollectionRef);

		// If the collection exists and has documents, return the snapshot
		if (!querySnapshot.empty) {
			return querySnapshot;
		}
		return null;
	} catch (error) {
		console.error('Unable to verify if list exists: ', error.message);
		return null;
	}
}

export async function comparePurchaseUrgency(listId) {
	const listCollectionRef = collection(db, listId);

	try {
		// Create a query with 'orderBy' to sort documents by the 'name' field (alphabetize)
		const q = query(listCollectionRef, orderBy('name'));

		// Execute the query and get the query snapshot
		const querySnapshot = await getDocs(q);

		// Initialize an array to store the sorted data
		const sortedData = [];

		// Iterate through the documents in the snapshot and push them to the array
		// after also adding daysUntilPurchase to itemData
		querySnapshot.forEach((doc) => {
			const itemData = { id: doc.id, ...doc.data() };

			const daysUntilPurchase = getDaysBetweenDates(
				new Date(),
				itemData.dateNextPurchased.toDate(),
			);

			itemData.daysUntilPurchase = daysUntilPurchase;
			sortedData.push(itemData);
		});

		sortedData.sort((a, b) => {
			// Compare by 'dateLastPurchased' -> items with null values will come first (overdue / not yet purchased)
			if (a.dateLastPurchased === null && b.dateLastPurchased !== null) {
				return -1;
			}
			if (b.dateLastPurchased === null && a.dateLastPurchased !== null) {
				return 1;
			}
			// If 'dateLastPurchased' is equal or both are null, then compare by 'daysUntilPurchase'
			return a.daysUntilPurchase - b.daysUntilPurchase;
		});

		console.log(sortedData);
		return sortedData;
	} catch (e) {
		console.error('Error querying and sorting data:', e);
		return [];
	}
}
