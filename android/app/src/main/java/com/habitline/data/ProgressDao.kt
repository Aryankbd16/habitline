package com.habitline.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

@Dao
interface ProgressDao {
    @Query("SELECT * FROM goals WHERE profileId = :owner ORDER BY rowid DESC")
    fun goals(owner: String): List<LocalGoal>

    @Query("SELECT * FROM goals WHERE id = :id AND profileId = :owner")
    fun goal(owner: String, id: String): LocalGoal?

    @Query("SELECT goal_habits.* FROM goal_habits JOIN goals ON goal_habits.goalId = goals.id WHERE goals.profileId = :owner")
    fun goalHabits(owner: String): List<GoalHabit>

    @Query("SELECT * FROM challenges WHERE profileId = :owner ORDER BY rowid DESC")
    fun challenges(owner: String): List<PersonalChallenge>

    @Query("SELECT * FROM challenges WHERE id = :id AND profileId = :owner")
    fun challenge(owner: String, id: String): PersonalChallenge?

    @Query("SELECT challenge_habits.* FROM challenge_habits JOIN challenges ON challenge_habits.challengeId = challenges.id WHERE challenges.profileId = :owner")
    fun challengeHabits(owner: String): List<ChallengeHabit>

    @Query("SELECT * FROM xp_events WHERE profileId = :owner ORDER BY rowid")
    fun events(owner: String): List<XpEvent>

    @Query("SELECT * FROM milestones WHERE profileId = :owner ORDER BY earnedOn DESC, rowid DESC")
    fun milestones(owner: String): List<Milestone>

    @Insert fun insert(goal: LocalGoal)
    @Insert fun insert(challenge: PersonalChallenge)
    @Insert fun insert(links: List<GoalHabit>)
    @Insert fun insertChallenges(links: List<ChallengeHabit>)
    @Insert(onConflict = OnConflictStrategy.IGNORE) fun insertMilestones(rows: List<Milestone>)
    @Update fun update(goal: LocalGoal)
    @Update fun update(challenge: PersonalChallenge)

    @Query("DELETE FROM goals WHERE id = :id AND profileId = :owner")
    fun deleteGoal(owner: String, id: String): Int

    @Query("DELETE FROM challenges WHERE id = :id AND profileId = :owner")
    fun deleteChallenge(owner: String, id: String): Int

    @Query("DELETE FROM goal_habits WHERE goalId = :id") fun clearGoalLinks(id: String)
    @Query("DELETE FROM challenge_habits WHERE challengeId = :id") fun clearChallengeLinks(id: String)
}
